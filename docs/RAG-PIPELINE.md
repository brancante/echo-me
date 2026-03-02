# RAG Pipeline Documentation

## Overview

The Echo Me RAG (Retrieval-Augmented Generation) pipeline enables the platform to ingest, process, and retrieve product knowledge from uploaded documents. This powers the AI chat assistant to answer questions about products with accurate, context-aware responses.

## Architecture

```
┌─────────────────┐
│  User Uploads   │
│   CSV/PDF/TXT   │
└────────┬────────┘
         │
         v
┌─────────────────┐      ┌──────────────┐
│  Upload API     │─────>│  PostgreSQL  │
│  route.ts       │      │  (metadata)  │
└────────┬────────┘      └──────────────┘
         │
         │ pushJob("rag_ingest", jobId)
         v
┌─────────────────┐
│  Redis Queue    │
│  "rag_ingest"   │
└────────┬────────┘
         │
         │ BLPOP (blocking pop)
         v
┌─────────────────┐
│  RAG Worker     │
│  rag/worker.py  │
└────────┬────────┘
         │
         ├─> Parse document (CSV/PDF/TXT)
         ├─> Chunk text (512 chars, 50 overlap)
         ├─> Generate embeddings (OpenAI)
         │
         v
┌─────────────────┐      ┌──────────────┐
│   ChromaDB      │<─────│  PostgreSQL  │
│  (vectors)      │      │  (chunks)    │
└─────────────────┘      └──────────────┘
```

## Components

### 1. Upload API (`web/app/api/products/upload/route.ts`)

**Responsibilities:**
- Accept file uploads via multipart form data
- Save files to disk at `/data/uploads/{user_id}/{product_id}/{filename}`
- Create product record in PostgreSQL
- Create RAG ingestion job
- Push job ID to Redis queue `rag_ingest`

**Request:**
```bash
POST /api/products/upload
Content-Type: multipart/form-data

file: <file_data>
name: "Product Catalog"
description: "Q1 2026 catalog"
```

**Response:**
```json
{
  "status": "queued",
  "product_id": "uuid-here",
  "job_id": "uuid-here",
  "message": "Product uploaded and queued for RAG processing"
}
```

### 2. RAG Worker (`engine/rag/worker.py`)

**Responsibilities:**
- Listen on Redis queue `rag_ingest` with blocking pop (BLPOP)
- Parse uploaded documents (CSV, PDF, TXT, MD)
- Chunk text using LangChain's RecursiveCharacterTextSplitter
- Generate embeddings via OpenAI `text-embedding-3-small`
- Store vectors in ChromaDB with user-scoped collections
- Store chunk metadata in PostgreSQL for reference
- Update job status (pending → processing → completed/failed)
- Update product `rag_status` field

**Job Processing Flow:**
1. Pop job ID from Redis queue (blocks up to 5 seconds)
2. Fetch full job details from PostgreSQL
3. Update job status to `processing`
4. Parse document based on file extension
5. Chunk the extracted text
6. Generate embeddings in batches
7. Store in ChromaDB collection `product_embeddings_{user_id}`
8. Store chunk references in PostgreSQL `product_chunks` table
9. Update product `rag_status = 'ready'`
10. Update job `status = 'completed'` with output metadata

**Error Handling:**
- Catches all exceptions during processing
- Updates product `rag_status = 'failed'`
- Updates job `status = 'failed'` with error message
- Logs full traceback for debugging

### 3. Database Schema

**products table:**
```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  source_file VARCHAR(500),
  metadata JSONB,
  rag_status VARCHAR(50) DEFAULT 'pending',  -- pending, processing, ready, failed
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**product_chunks table:**
```sql
CREATE TABLE product_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id),
  content TEXT NOT NULL,
  chunk_index INT NOT NULL,
  embedding_id VARCHAR(255),  -- ChromaDB document ID
  created_at TIMESTAMP DEFAULT NOW()
);
```

**jobs table:**
```sql
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  type VARCHAR(50) NOT NULL,  -- 'rag_ingest', 'heygen_train', etc.
  status VARCHAR(50) DEFAULT 'pending',
  input JSONB,
  output JSONB,
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);
```

### 4. ChromaDB Storage

**Collection Naming:**
- Pattern: `product_embeddings_{user_id}`
- Ensures data isolation between users
- One collection per user contains all their product embeddings

**Document Structure:**
```python
{
  "id": "product_uuid_chunk_index",
  "embedding": [0.123, -0.456, ...],  # 1536 dimensions
  "document": "chunk text content",
  "metadata": {
    "product_id": "uuid",
    "chunk_index": 0
  }
}
```

## Supported File Formats

### CSV
- Parsed with Python's `csv.DictReader`
- Each row converted to `"key: value | key: value"` format
- Preserves column structure for better retrieval

### PDF
- Requires `pypdf` package
- Extracts text from all pages
- Concatenates with newlines

### Plain Text (TXT, MD)
- Direct UTF-8 read
- No preprocessing required

## Configuration

**Environment Variables:**
```bash
# Required for RAG pipeline
OPENAI_API_KEY=sk-...              # For embeddings
DATABASE_URL=postgresql://...      # Job/product metadata
REDIS_URL=redis://localhost:6379   # Job queue
CHROMA_HOST=chroma                 # ChromaDB hostname
CHROMA_PORT=8000                   # ChromaDB port
DATA_DIR=/data                     # File storage root
```

## Running the Worker

**Development:**
```bash
cd engine
pip install -r requirements.txt
python -m rag.worker
```

**Docker:**
```bash
docker-compose up -d rag-worker
```

**Expected Output:**
```
2026-03-02 22:00:00 [rag] 🚀 RAG worker started — listening on Redis queue 'rag_ingest'...
2026-03-02 22:01:15 [rag] 📥 Processing job abc-123-def
2026-03-02 22:01:16 [rag] Parsing products.csv (12543 bytes)
2026-03-02 22:01:16 [rag] Chunking document with RecursiveCharacterTextSplitter
2026-03-02 22:01:16 [rag] Created 24 chunks
2026-03-02 22:01:17 [rag] Generating embeddings via OpenAI
2026-03-02 22:01:19 [rag] Storing in ChromaDB
2026-03-02 22:01:19 [rag] Storing chunk references in PostgreSQL
2026-03-02 22:01:19 [rag] ✅ RAG ingestion complete — 24 chunks stored in product_embeddings_user123
```

## Testing

Run the test script:
```bash
./scripts/test-rag.sh
```

Manual test flow:
1. Start infrastructure: `docker-compose up -d db redis chroma`
2. Start RAG worker: `cd engine && python -m rag.worker`
3. Upload a test file via the web UI or API
4. Watch worker logs for processing
5. Verify chunks in PostgreSQL: `SELECT COUNT(*) FROM product_chunks;`
6. Verify ChromaDB collections: `curl http://localhost:8000/api/v1/collections`

## Retrieval (Coming Soon)

The next phase will implement semantic search:

```python
def query_product_knowledge(user_id: str, query: str, top_k: int = 5):
    """Query the RAG system for relevant product information."""
    # Generate query embedding
    query_embedding = embed_texts([query])[0]
    
    # Search ChromaDB
    chroma = get_chroma_client()
    collection = chroma.get_collection(f"product_embeddings_{user_id}")
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=top_k
    )
    
    return results["documents"][0]  # Top K most relevant chunks
```

This will power the chat engine's context retrieval for answering product questions.

## Troubleshooting

**Worker not processing jobs:**
- Check Redis connection: `redis-cli PING`
- Check queue: `redis-cli LLEN rag_ingest`
- Check worker logs for errors

**Embeddings failing:**
- Verify `OPENAI_API_KEY` is set correctly
- Check OpenAI API quota/rate limits
- Ensure `openai` package is installed

**ChromaDB errors:**
- Verify ChromaDB is running: `curl http://localhost:8000/api/v1/heartbeat`
- Check ChromaDB logs: `docker-compose logs chroma`

**File parsing errors:**
- CSV: Check encoding (must be UTF-8)
- PDF: Install `pypdf`: `pip install pypdf`
- Verify file exists at the expected path in `/data/uploads/`

## Performance Considerations

- **Chunking:** 512 chars with 50-char overlap balances context vs. precision
- **Embedding batch size:** OpenAI allows up to 2048 texts per request
- **ChromaDB scaling:** Consider self-hosted deployment for >100K documents
- **Rate limits:** OpenAI text-embedding-3-small: 1M tokens/min (Tier 1)

## Next Steps

- [ ] Implement retrieval endpoint `/api/products/query`
- [ ] Add hybrid search (semantic + keyword)
- [ ] Implement chunk re-ranking
- [ ] Add support for images (OCR + vision embeddings)
- [ ] Implement incremental updates (add/remove documents)
- [ ] Add analytics (query volume, hit rate, latency)
