# Echo Me - RAG Engine

## Overview

The RAG (Retrieval-Augmented Generation) engine provides grounded product knowledge to the persona LLM. It ingests product catalogs (CSV, PDF, plain text), chunks and embeds content, stores vectors in ChromaDB, and retrieves relevant context per customer query.

---

## High-Level Flow

```
Document Upload (CSV/PDF/TXT)
        │
        ▼
[Parse + Normalize]
        │
        ▼
[Chunking]
(size=512 tokens, overlap=50)
        │
        ▼
[Embedding Generation]
(text-embedding-3-small, 1536d)
        │
        ▼
[Vector Storage]
ChromaDB: product_embeddings_{user_id}
        │
        ▼
Ready for Query

---------------------------------------------------

Incoming Question
        │
        ▼
[Embed Query]
        │
        ▼
[Vector Search top_k=10]
        │
        ▼
[Rerank top_k=5]
        │
        ▼
[Context Assembly]
(persona + rag hits + client context + question)
        │
        ▼
LLM Response (grounded)
```

---

## 1) Document Ingestion Pipeline

### Supported Inputs
- CSV (`.csv`): Product rows and structured columns
- PDF (`.pdf`): Catalogs, brochures, datasheets
- Plain text (`.txt`, `.md`): Product notes/manuals

### Parser Strategy

```python
# engine/rag/ingest.py
from pathlib import Path
import pandas as pd
from pypdf import PdfReader


def parse_document(file_path: str) -> list[dict]:
    ext = Path(file_path).suffix.lower()

    if ext == ".csv":
        df = pd.read_csv(file_path)
        docs = []
        for i, row in df.iterrows():
            text = "\n".join([f"{k}: {v}" for k, v in row.to_dict().items() if pd.notna(v)])
            docs.append({"text": text, "metadata": {"source": file_path, "row": i}})
        return docs

    if ext == ".pdf":
        reader = PdfReader(file_path)
        docs = []
        for page_no, page in enumerate(reader.pages, start=1):
            text = page.extract_text() or ""
            docs.append({"text": text, "metadata": {"source": file_path, "page": page_no}})
        return docs

    if ext in [".txt", ".md"]:
        content = Path(file_path).read_text(encoding="utf-8")
        return [{"text": content, "metadata": {"source": file_path}}]

    raise ValueError(f"Unsupported file type: {ext}")
```

---

## 2) Chunking Strategy

### Default Parameters
- Chunk size: **512 tokens**
- Overlap: **50 tokens**
- Splitter: Recursive character-based with token awareness
- Metadata preserved per chunk

### Why 512/50?
- 512 gives enough semantic context per chunk for product Q&A
- 50 overlap preserves continuity for boundary-spanning facts
- Balances recall quality and token/cost efficiency

```python
from langchain_text_splitters import RecursiveCharacterTextSplitter

splitter = RecursiveCharacterTextSplitter(
    chunk_size=1800,
    chunk_overlap=180,
    separators=["\n\n", "\n", ". ", " ", ""]
)

def chunk_documents(parsed_docs):
    chunks = []
    for doc in parsed_docs:
        text_chunks = splitter.split_text(doc["text"])
        for idx, c in enumerate(text_chunks):
            chunks.append({
                "content": c,
                "chunk_index": idx,
                "metadata": {**doc["metadata"], "chunk_index": idx}
            })
    return chunks
```

---

## 3) Embedding Generation

### Models & Dimensions
- `text-embedding-3-small` → 1536 dimensions (default)
- `text-embedding-3-large` → 3072 dimensions
- `all-MiniLM-L6-v2` (local) → 384 dimensions

```python
from openai import OpenAI
client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

def embed_texts(texts: list[str], model="text-embedding-3-small"):
    r = client.embeddings.create(model=model, input=texts)
    return [x.embedding for x in r.data]
```

---

## 4) Vector DB Storage (ChromaDB)

### Collections
- `product_embeddings_{user_id}`
- `persona_transcripts_{user_id}`

```python
import chromadb
chroma = chromadb.HttpClient(host="localhost", port=8000)


def upsert_embeddings(user_id, chunks, vectors):
    col = chroma.get_or_create_collection(name=f"product_embeddings_{user_id}")
    col.upsert(
        ids=[f"{c['metadata'].get('product_id','p')}_{c['chunk_index']}" for c in chunks],
        documents=[c['content'] for c in chunks],
        metadatas=[c['metadata'] for c in chunks],
        embeddings=vectors,
    )
```

---

## 5) Query Pipeline

```
question -> embed -> vector search(top_k=10) -> rerank -> final top_k=5 -> context
```

```python

def query_products(user_id, question, top_k=10, final_k=5):
    col = chroma.get_collection(name=f"product_embeddings_{user_id}")
    qv = embed_texts([question])[0]
    raw = col.query(query_embeddings=[qv], n_results=top_k, where={"in_stock": True})

    hits = []
    for i in range(len(raw["ids"][0])):
        hits.append({
            "id": raw["ids"][0][i],
            "content": raw["documents"][0][i],
            "metadata": raw["metadatas"][0][i],
            "distance": raw["distances"][0][i],
        })

    # heuristic rerank
    for h in hits:
        h["score"] = (1 - float(h["distance"])) + (0.1 if h["metadata"].get("in_stock") else -0.5)

    return sorted(hits, key=lambda x: x["score"], reverse=True)[:final_k]
```

---

## 6) Prompt Assembly

```python
def assemble_prompt(persona_system, client_ctx, rag_hits, question):
    refs = "\n\n".join([
      f"[#{i+1}] {h['metadata'].get('product_name','Unknown')}\n{h['content']}"
      for i, h in enumerate(rag_hits)
    ])

    user_prompt = f"""
Client: {client_ctx.get('name','Unknown')}
Client notes: {client_ctx.get('notes','')}

Context:
{refs}

Question: {question}

Rules:
- Use only the provided context.
- Cite sources as [#1], [#2], etc.
- If unsure, say you need to verify.
"""
    return {"system": persona_system, "user": user_prompt}
```

---

## 7) Hallucination Prevention

### Mechanisms
1. Grounding-only instruction
2. Citation-required output
3. No-context fallback response
4. Optional post-check for unsupported claims

### Fallback Text
> "I don't have enough verified information in my catalog to answer that confidently. Can you tell me the exact product name or use case?"

---

## 8) Performance Notes

- Embedding in batches (100-500 rows/call)
- Pre-filter by metadata (`in_stock=true`, category)
- Cache frequent query embeddings (TTL 10-30 min)
- Keep final context to top 5 chunks for token control

Target latency:
- Retrieval + rerank: **<150ms**
- Full answer (with LLM + TTS): **3-8s**

---

## 9) Test Plan

- Parser unit tests per format
- Chunk boundary tests
- Retrieval relevance benchmark (Recall@10)
- Grounding test: no-citation answers must fail validation

---

**Last updated:** 2025-02-18  
**Version:** 1.0 (MVP)
