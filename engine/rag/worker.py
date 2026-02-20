"""RAG ingestion worker — parses documents, chunks, embeds, stores in ChromaDB."""

import json
import logging
from pathlib import Path
from typing import List

import chromadb
from openai import OpenAI
from langchain.text_splitter import RecursiveCharacterTextSplitter

from config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [rag] %(message)s")
logger = logging.getLogger(__name__)

text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=512,
    chunk_overlap=50,
    length_function=len,
)


def get_chroma_client():
    return chromadb.HttpClient(host=settings.chroma_host, port=settings.chroma_port)


def parse_document(file_path: Path) -> str:
    """Parse CSV or PDF into plain text."""
    suffix = file_path.suffix.lower()

    if suffix == ".csv":
        import csv
        rows = []
        with open(file_path, "r") as f:
            reader = csv.DictReader(f)
            for row in reader:
                rows.append(" | ".join(f"{k}: {v}" for k, v in row.items()))
        return "\n".join(rows)

    elif suffix == ".pdf":
        from pypdf import PdfReader
        reader = PdfReader(str(file_path))
        return "\n".join(page.extract_text() or "" for page in reader.pages)

    elif suffix in (".txt", ".md"):
        return file_path.read_text()

    else:
        raise ValueError(f"Unsupported file type: {suffix}")


def embed_texts(texts: List[str]) -> List[List[float]]:
    """Generate embeddings via OpenAI."""
    client = OpenAI(api_key=settings.openai_api_key)
    response = client.embeddings.create(model="text-embedding-3-small", input=texts)
    return [item.embedding for item in response.data]


def process_job(job_id: str, user_id: str, product_id: str, file_path: str):
    """Full RAG ingestion pipeline."""
    from db import get_db

    with get_db() as db:
        db.execute("UPDATE jobs SET status = 'processing', started_at = NOW() WHERE id = :id", {"id": job_id})

    try:
        path = Path(file_path)
        logger.info(f"Parsing {path}")
        text = parse_document(path)

        logger.info("Chunking document")
        chunks = text_splitter.split_text(text)
        logger.info(f"Created {len(chunks)} chunks")

        logger.info("Generating embeddings")
        embeddings = embed_texts(chunks)

        logger.info("Storing in ChromaDB")
        chroma = get_chroma_client()
        collection = chroma.get_or_create_collection(f"product_embeddings_{user_id}")

        ids = [f"{product_id}_{i}" for i in range(len(chunks))]
        metadatas = [{"product_id": product_id, "chunk_index": i} for i in range(len(chunks))]

        collection.add(
            ids=ids,
            embeddings=embeddings,
            documents=chunks,
            metadatas=metadatas,
        )

        # Store chunk references in PostgreSQL
        with get_db() as db:
            for i, chunk in enumerate(chunks):
                db.execute(
                    "INSERT INTO product_chunks (product_id, content, chunk_index, embedding_id) "
                    "VALUES (:pid, :content, :idx, :eid)",
                    {"pid": product_id, "content": chunk, "idx": i, "eid": ids[i]},
                )
            db.execute(
                "UPDATE jobs SET status = 'completed', completed_at = NOW(), "
                "output = :out WHERE id = :id",
                {"out": json.dumps({"chunks": len(chunks)}), "id": job_id},
            )

        logger.info(f"RAG ingestion complete — {len(chunks)} chunks stored")

    except Exception as e:
        logger.error(f"Job {job_id} failed: {e}")
        with get_db() as db:
            db.execute(
                "UPDATE jobs SET status = 'failed', error = :err, completed_at = NOW() WHERE id = :id",
                {"err": str(e), "id": job_id},
            )


if __name__ == "__main__":
    logger.info("RAG worker started — polling for jobs...")
    import time

    while True:
        from db import get_db

        with get_db() as db:
            result = db.execute(
                "SELECT j.id, j.user_id, j.input FROM jobs j "
                "WHERE j.type = 'rag_ingest' AND j.status = 'pending' "
                "ORDER BY j.created_at LIMIT 1"
            ).fetchone()

        if result:
            job_input = json.loads(result[2]) if isinstance(result[2], str) else result[2]
            process_job(
                job_id=str(result[0]),
                user_id=str(result[1]),
                product_id=job_input["product_id"],
                file_path=job_input["file_path"],
            )
        else:
            time.sleep(5)
