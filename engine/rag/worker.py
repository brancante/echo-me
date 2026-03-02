"""RAG ingestion worker — parses documents, chunks, embeds, stores in ChromaDB."""

import json
import logging
import time
from pathlib import Path
from typing import List

import chromadb
import redis
from openai import OpenAI
from langchain.text_splitter import RecursiveCharacterTextSplitter
from sqlalchemy import text

from config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [rag] %(message)s")
logger = logging.getLogger(__name__)

redis_client = redis.from_url(settings.redis_url)

text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=512,
    chunk_overlap=50,
    length_function=len,
)


def get_chroma_client():
    """Initialize ChromaDB HTTP client."""
    return chromadb.HttpClient(host=settings.chroma_host, port=settings.chroma_port)


def parse_document(file_path: Path) -> str:
    """Parse CSV, PDF, or plain text into structured text."""
    suffix = file_path.suffix.lower()

    if suffix == ".csv":
        import csv
        rows = []
        with open(file_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                rows.append(" | ".join(f"{k}: {v}" for k, v in row.items()))
        return "\n".join(rows)

    elif suffix == ".pdf":
        try:
            from pypdf import PdfReader
            reader = PdfReader(str(file_path))
            return "\n".join(page.extract_text() or "" for page in reader.pages)
        except ImportError:
            raise ImportError("pypdf is required for PDF parsing. Install with: pip install pypdf")

    elif suffix in (".txt", ".md"):
        return file_path.read_text(encoding="utf-8")

    else:
        raise ValueError(f"Unsupported file type: {suffix}")


def embed_texts(texts: List[str]) -> List[List[float]]:
    """Generate embeddings via OpenAI text-embedding-3-small."""
    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY not configured")
    
    client = OpenAI(api_key=settings.openai_api_key)
    response = client.embeddings.create(model="text-embedding-3-small", input=texts)
    return [item.embedding for item in response.data]


def process_rag_job(job_id: str, user_id: str, product_id: str, file_path: str):
    """Full RAG ingestion pipeline — parse, chunk, embed, store."""
    from db import get_db

    with get_db() as db:
        db.execute(
            text("UPDATE jobs SET status = 'processing', started_at = NOW() WHERE id = :id"),
            {"id": job_id},
        )

    try:
        path = Path(file_path)
        
        if not path.exists():
            raise FileNotFoundError(f"Upload file not found: {file_path}")

        logger.info(f"Parsing {path.name} ({path.stat().st_size} bytes)")
        text_content = parse_document(path)
        
        if not text_content.strip():
            raise ValueError("Document parsing resulted in empty text")

        logger.info("Chunking document with RecursiveCharacterTextSplitter")
        chunks = text_splitter.split_text(text_content)
        logger.info(f"Created {len(chunks)} chunks")

        if len(chunks) == 0:
            raise ValueError("Text splitting produced zero chunks")

        logger.info("Generating embeddings via OpenAI")
        embeddings = embed_texts(chunks)

        logger.info("Storing in ChromaDB")
        chroma = get_chroma_client()
        collection_name = f"product_embeddings_{user_id}"
        collection = chroma.get_or_create_collection(collection_name)

        ids = [f"{product_id}_{i}" for i in range(len(chunks))]
        metadatas = [{"product_id": product_id, "chunk_index": i} for i in range(len(chunks))]

        collection.add(
            ids=ids,
            embeddings=embeddings,
            documents=chunks,
            metadatas=metadatas,
        )

        logger.info("Storing chunk references in PostgreSQL")
        with get_db() as db:
            for i, chunk in enumerate(chunks):
                db.execute(
                    text(
                        """
                        INSERT INTO product_chunks (product_id, content, chunk_index, embedding_id)
                        VALUES (:pid, :content, :idx, :eid)
                        """
                    ),
                    {"pid": product_id, "content": chunk, "idx": i, "eid": ids[i]},
                )
            
            # Mark product as processed
            db.execute(
                text("UPDATE products SET rag_status = 'ready', updated_at = NOW() WHERE id = :pid"),
                {"pid": product_id},
            )
            
            # Mark job as completed
            db.execute(
                text(
                    """
                    UPDATE jobs
                    SET status = 'completed',
                        completed_at = NOW(),
                        output = :out
                    WHERE id = :id
                    """
                ),
                {"out": json.dumps({"chunks": len(chunks), "collection": collection_name}), "id": job_id},
            )

        logger.info(f"✅ RAG ingestion complete — {len(chunks)} chunks stored in {collection_name}")

    except Exception as e:
        logger.error(f"❌ Job {job_id} failed: {e}", exc_info=True)
        with get_db() as db:
            # Mark product as failed
            db.execute(
                text("UPDATE products SET rag_status = 'failed', updated_at = NOW() WHERE id = :pid"),
                {"pid": product_id},
            )
            # Mark job as failed
            db.execute(
                text(
                    """
                    UPDATE jobs
                    SET status = 'failed',
                        error = :err,
                        completed_at = NOW()
                    WHERE id = :id
                    """
                ),
                {"err": str(e), "id": job_id},
            )


if __name__ == "__main__":
    logger.info("🚀 RAG worker started — listening on Redis queue 'rag_ingest'...")
    from db import get_db

    while True:
        try:
            # Block until a job appears in the queue (BLPOP with 5s timeout)
            result = redis_client.blpop("rag_ingest", timeout=5)
            
            if not result:
                continue

            _, job_id_bytes = result
            job_id = job_id_bytes.decode("utf-8")
            logger.info(f"📥 Processing job {job_id}")

            # Fetch job details from database
            with get_db() as db:
                job_row = db.execute(
                    text("SELECT user_id, type, input FROM jobs WHERE id = :id"),
                    {"id": job_id},
                ).fetchone()

            if not job_row:
                logger.error(f"Job {job_id} not found in database")
                continue

            user_id = str(job_row[0])
            job_type = str(job_row[1])
            job_input = json.loads(job_row[2]) if isinstance(job_row[2], str) else job_row[2]

            if job_type != "rag_ingest":
                logger.warning(f"Skipping unsupported job type: {job_type}")
                continue

            # Process the RAG ingestion
            process_rag_job(
                job_id=job_id,
                user_id=user_id,
                product_id=job_input["product_id"],
                file_path=job_input["file_path"],
            )

        except KeyboardInterrupt:
            logger.info("🛑 Worker stopped by user")
            break
        except Exception as e:
            logger.error(f"Worker error: {e}", exc_info=True)
            time.sleep(5)  # Backoff on error
