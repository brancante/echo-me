# Echo Me - System Architecture

## Overview

Echo Me is a **virtual persona platform** that clones a person's voice and product knowledge to create an AI-powered sales representative. The system ingests YouTube videos to extract voice characteristics and communication patterns, combines this with product catalog data via RAG (Retrieval-Augmented Generation), and responds to customer queries through multiple channels (Telegram, email) using the cloned voice.

---

## High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          USER INTERFACE LAYER                            │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                     Next.js Web Application                       │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │   │
│  │  │  Landing    │ │  Dashboard  │ │   Persona   │ │   Settings  │ │   │
│  │  │    Page     │ │   (Voice,   │ │   Editor    │ │  (API Keys) │ │   │
│  │  │ (OAuth)     │ │  Products)  │ │  (Manual +  │ │             │ │   │
│  │  │             │ │             │ │   Auto)     │ │             │ │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ │   │
│  └────────────────────────────┬─────────────────────────────────────┘   │
│                               │                                          │
└───────────────────────────────┼──────────────────────────────────────────┘
                                │
                                │ Next.js API Routes
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         APPLICATION LAYER                                │
│                                                                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────────────┐ │
│  │  Auth Service    │  │  Job Queue       │  │  API Gateway          │ │
│  │  (NextAuth.js)   │  │  (BullMQ/Redis)  │  │  (Express/Next API)   │ │
│  │                  │  │                  │  │                       │ │
│  │  • Google OAuth  │  │  • Voice jobs    │  │  • /api/voice/*       │ │
│  │  • JWT sessions  │  │  • Persona jobs  │  │  • /api/persona/*     │ │
│  │  • User context  │  │  • RAG jobs      │  │  • /api/products/*    │ │
│  │                  │  │                  │  │  • /api/chat/*        │ │
│  └──────────────────┘  └──────────────────┘  │  • /webhook/telegram  │ │
│                                               └───────────────────────┘ │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         PROCESSING LAYER (Python)                        │
│                                                                          │
│  ┌───────────────────┐ ┌───────────────────┐ ┌──────────────────────┐  │
│  │  Voice Pipeline   │ │  Persona Engine   │ │    RAG Engine        │  │
│  │                   │ │                   │ │                      │  │
│  │  ┌─────────────┐  │ │  ┌─────────────┐  │ │  ┌────────────────┐  │  │
│  │  │ yt-dlp      │  │ │  │  Whisper    │  │ │  │  Document      │  │  │
│  │  │ (download)  │  │ │  │ (transcribe)│  │ │  │  Ingestion     │  │  │
│  │  └──────┬──────┘  │ │  └──────┬──────┘  │ │  │  (chunk+embed) │  │  │
│  │         │         │ │         │         │ │  └────────┬───────┘  │  │
│  │  ┌──────▼──────┐  │ │  ┌──────▼──────┐  │ │  ┌────────▼───────┐  │  │
│  │  │  ffmpeg     │  │ │  │    LLM      │  │ │  │  ChromaDB /    │  │  │
│  │  │  (extract)  │  │ │  │  Analysis   │  │ │  │  Qdrant        │  │  │
│  │  └──────┬──────┘  │ │  │  (persona   │  │ │  │  (vector DB)   │  │  │
│  │         │         │ │  │   extract)  │  │ │  └────────┬───────┘  │  │
│  │  ┌──────▼──────┐  │ │  └─────────────┘  │ │  ┌────────▼───────┐  │  │
│  │  │ ElevenLabs  │  │ │                   │ │  │  Query Engine  │  │  │
│  │  │ Voice Clone │  │ │                   │ │  │  (search +     │  │  │
│  │  │     API     │  │ │                   │ │  │   rerank)      │  │  │
│  │  └─────────────┘  │ │                   │ │  └────────────────┘  │  │
│  └───────────────────┘ └───────────────────┘ └──────────────────────┘  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                      LLM + TTS Engine                               │ │
│  │                                                                     │ │
│  │  Persona Context + RAG Results + Client Info → LLM (OpenAI/Claude) │ │
│  │                           ↓                                         │ │
│  │                  Generated Response                                 │ │
│  │                           ↓                                         │ │
│  │              ElevenLabs TTS (Cloned Voice)                          │ │
│  │                           ↓                                         │ │
│  │                      Audio File                                     │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         CHANNEL LAYER                                    │
│                                                                          │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────────┐ │
│  │  Telegram Bot  │  │  Email Handler │  │  WhatsApp (Future)         │ │
│  │                │  │                │  │                            │ │
│  │  • Webhook     │  │  • SMTP/IMAP   │  │  • Business API            │ │
│  │  • Audio reply │  │  • Email parse │  │  • Media messages          │ │
│  │  • Commands    │  │  • Template    │  │                            │ │
│  └────────────────┘  └────────────────┘  └────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         DATA LAYER                                       │
│                                                                          │
│  ┌──────────────────────────┐  ┌────────────────────────────────────┐  │
│  │      PostgreSQL          │  │       ChromaDB / Qdrant            │  │
│  │                          │  │                                    │  │
│  │  • users                 │  │  • product_embeddings collection   │  │
│  │  • personas              │  │  • persona_transcripts collection  │  │
│  │  • persona_profiles      │  │                                    │  │
│  │  • products              │  │  Vector search (cosine similarity) │  │
│  │  • product_chunks        │  │                                    │  │
│  │  • clients               │  │                                    │  │
│  │  • api_keys              │  │                                    │  │
│  │  • jobs                  │  │                                    │  │
│  │  • conversations         │  │                                    │  │
│  └──────────────────────────┘  └────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────┐  ┌────────────────────────────────────┐  │
│  │      Redis (Queue)       │  │      File Storage (Local/S3)       │  │
│  │                          │  │                                    │  │
│  │  • Job queue             │  │  • Audio files (temp + cloned)     │  │
│  │  • Session cache         │  │  • Uploaded products (CSV/PDF)     │  │
│  │  • Rate limiting         │  │  • Generated TTS audio             │  │
│  └──────────────────────────┘  └────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### 1. Voice Cloning Flow

```
User (Dashboard) → YouTube URL input
    │
    ▼
Next.js API (/api/voice/clone)
    │
    ├─→ Create job record (status: pending)
    │
    ▼
Python Worker (engine/voice/)
    │
    ├─→ yt-dlp: Download YouTube video/audio
    │   └─→ Save to: data/audio/{user_id}/{video_id}.mp4
    │
    ├─→ ffmpeg: Extract clean audio
    │   └─→ Convert to: data/audio/{user_id}/{video_id}.wav
    │
    ├─→ ElevenLabs API: Clone voice
    │   ├─→ POST /v1/voices/add
    │   ├─→ Upload audio samples
    │   └─→ Receive: voice_id
    │
    ├─→ Update DB: personas.voice_id = voice_id
    │   └─→ Update job: status = completed
    │
    └─→ Cleanup: Delete temporary audio files

User sees: Voice cloned ✓ (in dashboard)
```

### 2. Persona Extraction Flow

```
YouTube URL (same as voice cloning)
    │
    ▼
Python Worker (engine/persona/)
    │
    ├─→ Whisper: Transcribe audio
    │   ├─→ Input: data/audio/{user_id}/{video_id}.wav
    │   └─→ Output: full transcript (text)
    │
    ├─→ LLM Analysis (GPT-4 / Claude)
    │   ├─→ Prompt: Extract persona characteristics
    │   │   • Speech patterns (catchphrases, fillers)
    │   │   • Vocabulary level & style
    │   │   • Tone (formal/casual, energy level)
    │   │   • Selling approach
    │   │   • Common expressions
    │   │
    │   └─→ Output: JSON persona profile
    │
    ├─→ Store in DB: persona_profiles table
    │   ├─→ auto_extracted (JSON blob)
    │   └─→ manual_overrides (initially null)
    │
    └─→ Update job: status = completed

User (Dashboard/Persona page) → Review & edit auto-extracted persona
    │
    ▼
Save manual overrides → Merged persona profile
    │
    └─→ Used in all LLM calls as system context
```

### 3. Product Ingestion Flow (RAG)

```
User uploads CSV/PDF
    │
    ▼
Next.js API (/api/products/upload)
    │
    ├─→ Save file: data/uploads/{user_id}/{file_id}.csv
    │
    ├─→ Create job record (status: pending)
    │
    ▼
Python Worker (engine/rag/)
    │
    ├─→ Parse document
    │   ├─→ CSV: read rows, extract columns
    │   └─→ PDF: extract text with pypdf/pdfplumber
    │
    ├─→ Chunk documents
    │   ├─→ Strategy: RecursiveCharacterTextSplitter
    │   ├─→ Chunk size: 512 tokens
    │   ├─→ Overlap: 50 tokens
    │   └─→ Metadata: {product_id, source, page, etc.}
    │
    ├─→ Generate embeddings
    │   ├─→ Model: text-embedding-3-small (OpenAI) or all-MiniLM-L6-v2 (local)
    │   └─→ Dimensions: 1536 (OpenAI) or 384 (local)
    │
    ├─→ Store in Vector DB (ChromaDB)
    │   ├─→ Collection: product_embeddings_{user_id}
    │   └─→ Save: {chunk_id, embedding, metadata}
    │
    ├─→ Store metadata in PostgreSQL
    │   ├─→ products: {id, name, description, ...}
    │   └─→ product_chunks: {id, product_id, content, chunk_index}
    │
    └─→ Update job: status = completed
```

### 4. Query + Response Flow (Telegram)

```
Customer sends message to Telegram bot
    │
    ▼
Telegram Bot API → Webhook: POST /webhook/telegram
    │
    ├─→ Extract: chat_id, message_text, user_info
    │
    ├─→ Lookup client in DB (by telegram_id)
    │   └─→ If exists: load client context (name, history, preferences)
    │
    ▼
RAG Query (engine/rag/query.py)
    │
    ├─→ Embed user question
    │   └─→ text-embedding-3-small(question) → query_vector
    │
    ├─→ Vector search (ChromaDB)
    │   ├─→ Query collection: product_embeddings_{user_id}
    │   ├─→ top_k = 10 (initial retrieval)
    │   └─→ Returns: 10 most similar chunks
    │
    ├─→ Rerank results (optional: Cohere Rerank API or semantic scoring)
    │   └─→ top_k = 5 (final context)
    │
    └─→ Build context: 5 product chunks + metadata
    │
    ▼
LLM Chain (engine/llm/chain.py)
    │
    ├─→ Load persona profile from DB
    │   ├─→ Merge: auto_extracted + manual_overrides
    │   └─→ Build system prompt:
    │       "You are {name}, {role}. Your personality: {traits}.
    │        Your tone: {tone}. Speech patterns: {patterns}.
    │        Always: {dos}. Never: {donts}. Context: {backstory}"
    │
    ├─→ Build user prompt:
    │   "Client: {client_name} (context: {client_notes})
    │    Product context (from RAG):
    │    1. {chunk_1}
    │    2. {chunk_2}
    │    ...
    │    Question: {user_message}
    │    
    │    Answer as {persona_name} would, using the product context."
    │
    ├─→ LLM call (GPT-4o / Claude Sonnet)
    │   └─→ Returns: text response
    │
    ▼
TTS (engine/llm/tts.py)
    │
    ├─→ ElevenLabs TTS API
    │   ├─→ POST /v1/text-to-speech/{voice_id}
    │   ├─→ Input: LLM response text + voice_id (cloned voice)
    │   ├─→ Settings: stability=0.5, similarity_boost=0.75
    │   └─→ Output: audio file (mp3)
    │
    ├─→ Convert to Telegram format
    │   ├─→ ffmpeg: mp3 → ogg (Opus codec)
    │   └─→ Save: data/audio/responses/{message_id}.ogg
    │
    ▼
Send to Telegram
    │
    ├─→ Telegram Bot API: sendVoice
    │   ├─→ chat_id = customer's chat_id
    │   ├─→ voice = audio file
    │   └─→ caption = (optional text fallback)
    │
    └─→ Log conversation in DB (conversations table)
```

---

## Service Boundaries

### Web Service (Next.js)
- **Responsibilities:**
  - User authentication (Google OAuth)
  - Dashboard UI rendering
  - API gateway (proxies to Python workers)
  - Session management
  - File uploads (products, images)
  - Real-time job status updates (polling or WebSocket)

- **Technologies:**
  - Next.js 14 (App Router)
  - NextAuth.js (Google OAuth provider)
  - Tailwind CSS + shadcn/ui
  - PostgreSQL client (pg/Prisma)
  - Redis client (job queue monitoring)

- **Ports:**
  - 3000 (HTTP)

### Engine Workers (Python)
- **Responsibilities:**
  - Long-running async tasks (voice cloning, persona extraction, RAG ingestion)
  - YouTube download (yt-dlp)
  - Audio processing (ffmpeg)
  - LLM orchestration (OpenAI/Anthropic SDKs)
  - Vector database operations (ChromaDB/Qdrant)
  - Channel message handling (Telegram, email)

- **Technologies:**
  - Python 3.11+
  - LangChain / LlamaIndex (RAG framework)
  - OpenAI Whisper (transcription)
  - ElevenLabs SDK (voice cloning + TTS)
  - yt-dlp (YouTube download)
  - ffmpeg-python (audio processing)
  - python-telegram-bot (Telegram SDK)
  - SQLAlchemy (PostgreSQL ORM)
  - ChromaDB / Qdrant client

- **Deployment:**
  - Background workers (systemd/Docker services)
  - Job queue consumers (BullMQ/Celery)

### PostgreSQL (Database)
- **Responsibilities:**
  - User accounts & auth state
  - Persona metadata (voice_id, profile JSON)
  - Product catalog (structured data)
  - Clients & contact info
  - API keys (encrypted)
  - Job queue & status tracking
  - Conversation logs

- **Version:** PostgreSQL 15+
- **Extensions:** pgcrypto (for API key encryption)

### ChromaDB / Qdrant (Vector Database)
- **Responsibilities:**
  - Store product embeddings
  - Store persona transcript embeddings (for future multi-video analysis)
  - Fast similarity search (cosine distance)

- **Collections:**
  - `product_embeddings_{user_id}`: RAG product knowledge
  - `persona_transcripts_{user_id}`: Multi-video persona corpus

### Redis (Cache & Queue)
- **Responsibilities:**
  - Job queue (BullMQ)
  - Session caching (NextAuth.js)
  - Rate limiting (API endpoints)
  - Temporary data (TTS audio URLs)

### External APIs
- **ElevenLabs:** Voice cloning + TTS
- **OpenAI:** LLM (GPT-4o), embeddings, Whisper
- **Anthropic:** LLM (Claude Sonnet)
- **Telegram:** Bot API (webhook)
- **Google:** OAuth 2.0 (authentication)

---

## Deployment Topology (Docker Compose)

```yaml
# Simplified docker-compose.yml structure

services:
  web:
    image: node:22
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL
      - NEXTAUTH_SECRET
      - GOOGLE_CLIENT_ID
      - GOOGLE_CLIENT_SECRET
    depends_on:
      - db
      - redis
    volumes:
      - ./web:/app
      - ./data:/data

  engine-voice:
    image: python:3.11
    command: python -m engine.voice.worker
    environment:
      - DATABASE_URL
      - ELEVENLABS_API_KEY
    depends_on:
      - db
      - redis
    volumes:
      - ./engine:/app
      - ./data:/data

  engine-persona:
    image: python:3.11
    command: python -m engine.persona.worker
    environment:
      - DATABASE_URL
      - OPENAI_API_KEY
    depends_on:
      - db
      - redis
    volumes:
      - ./engine:/app
      - ./data:/data

  engine-rag:
    image: python:3.11
    command: python -m engine.rag.worker
    environment:
      - DATABASE_URL
      - OPENAI_API_KEY
      - CHROMA_HOST
    depends_on:
      - db
      - redis
      - chroma
    volumes:
      - ./engine:/app
      - ./data:/data

  engine-telegram:
    image: python:3.11
    command: python -m engine.channels.telegram
    environment:
      - DATABASE_URL
      - TELEGRAM_BOT_TOKEN
      - ELEVENLABS_API_KEY
      - OPENAI_API_KEY
    depends_on:
      - db
      - redis
      - chroma
    volumes:
      - ./engine:/app
      - ./data:/data

  db:
    image: postgres:15
    environment:
      - POSTGRES_DB=echome
      - POSTGRES_USER=echo
      - POSTGRES_PASSWORD=echo
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  chroma:
    image: chromadb/chroma:latest
    ports:
      - "8000:8000"
    volumes:
      - chromadata:/chroma/chroma

volumes:
  pgdata:
  chromadata:
```

### Container Communication
- All services communicate over Docker network `echo-me_default`
- Web service exposes port 3000 to host
- Engine workers are internal (no exposed ports)
- Databases expose ports for development (can be removed in production)

---

## Technology Choices & Justification

### Frontend: Next.js 14
- **Why:** Server-side rendering + API routes in one framework, excellent TypeScript support, large ecosystem (shadcn/ui)
- **Alternatives considered:** SvelteKit (smaller bundle), Remix (better data loading)
- **Trade-off:** Next.js has more boilerplate but better long-term support

### Auth: NextAuth.js
- **Why:** Built for Next.js, supports Google OAuth out-of-the-box, handles JWT sessions
- **Alternatives:** Clerk (SaaS, more expensive), Auth0 (complex setup)
- **Trade-off:** Less flexible than custom auth, but faster to implement

### Backend Workers: Python
- **Why:** Superior AI/ML ecosystem (LangChain, Whisper, ElevenLabs SDK), easy integration with vector DBs
- **Alternatives:** Node.js (same stack as web, but weaker AI tools)
- **Trade-off:** Multi-language stack adds complexity

### Database: PostgreSQL
- **Why:** Robust ACID compliance, excellent JSON support (for persona profiles), widely supported
- **Alternatives:** MySQL (less JSON features), MongoDB (no strong schemas)
- **Trade-off:** Requires schema migrations (Prisma helps)

### Vector DB: ChromaDB
- **Why:** Lightweight, embeddable, Python-native, great for MVP
- **Alternatives:** Qdrant (more scalable), Pinecone (SaaS, expensive), Weaviate (over-engineered for MVP)
- **Trade-off:** ChromaDB less production-ready than Qdrant, but easier to start

### Voice: ElevenLabs
- **Why:** Best-in-class voice cloning quality, instant cloning from short samples, mature API
- **Alternatives:** Play.ht (cheaper), Resemble.ai (more control)
- **Trade-off:** Expensive ($330/mo for Creator plan), but quality justifies cost

### LLM: OpenAI (GPT-4o) / Anthropic (Claude Sonnet)
- **Why:** Best reasoning + context handling, fast response times
- **Alternatives:** Open-source (Llama 3, Mixtral) — cheaper but worse at persona emulation
- **Trade-off:** API costs scale with usage (~$0.01-0.03 per query)

### Job Queue: BullMQ (Redis-backed)
- **Why:** Node.js-native, reliable, good monitoring dashboard (bull-board)
- **Alternatives:** Celery (Python-native, but adds complexity to web layer)
- **Trade-off:** Requires Redis, but we already use it for caching

### Deployment: Docker Compose
- **Why:** Simple multi-service orchestration, reproducible environments, easy local dev
- **Alternatives:** Kubernetes (overkill for MVP), Railway (SaaS, limited Python worker support)
- **Trade-off:** Requires Docker knowledge, but standard in 2024

---

## Performance Considerations

### Bottlenecks
1. **Voice cloning:** 2-5 minutes per YouTube video (yt-dlp + Whisper + ElevenLabs)
2. **Persona extraction:** 1-2 minutes (LLM analysis on full transcript)
3. **RAG ingestion:** 10-30 seconds per 1000 products (embedding generation)
4. **TTS per message:** 2-5 seconds (ElevenLabs API latency)

### Optimizations
- **Caching:** Cache embeddings in Redis for frequent queries
- **Batch processing:** Process multiple RAG documents in parallel
- **CDN:** Serve static audio files via CDN (Cloudflare R2)
- **Connection pooling:** PostgreSQL + Redis connection pools

### Scalability Path
- **Phase 1 (MVP):** Single Docker Compose host (2-4 CPU cores, 8GB RAM)
- **Phase 2:** Separate engine workers to dedicated machines
- **Phase 3:** Horizontal scaling with load balancer + worker pool
- **Phase 4:** Migrate ChromaDB → Qdrant Cloud for distributed vector search

---

## Security Architecture

### Authentication Flow
```
User → Google OAuth → NextAuth.js → JWT session cookie
                                    ↓
                              PostgreSQL (users table)
```

### API Key Storage
- Encrypted at rest (pgcrypto)
- Never exposed in API responses
- Decrypted only in worker processes

### Data Isolation
- Multi-tenant by `user_id` foreign keys
- Vector DB collections namespaced: `product_embeddings_{user_id}`
- File storage in user-specific directories: `data/audio/{user_id}/`

### Network Security
- Web service: Public (HTTPS)
- Engine workers: Internal network only
- Databases: Internal network only (no public IPs in production)

---

## Monitoring & Observability

### Metrics to Track
- Job queue depth & processing time
- LLM API latency & token usage
- ElevenLabs API calls & cost
- Vector DB query performance
- Error rates per service

### Logging Strategy
- Structured logs (JSON) from all services
- Centralized log aggregation (future: Grafana Loki)
- Retention: 30 days (compressed)

### Health Checks
- `/api/health`: Web service health
- Worker liveness: Redis heartbeat
- Database connections: Connection pool metrics

---

## Disaster Recovery

### Backup Strategy
- **PostgreSQL:** Daily pg_dump backups to S3
- **ChromaDB:** Periodic snapshot exports
- **Audio files:** S3 sync (cloned voices only, temp files discarded)

### Recovery Time Objective (RTO)
- Critical: Database (< 1 hour)
- Non-critical: Vector DB (< 4 hours)

---

## Future Architecture Evolution

### Multi-Region Support
- Deploy vector DB replicas in multiple regions
- Route users to nearest LLM API endpoint

### Video Response Generation
- Integrate HeyGen/D-ID for video avatars
- New worker: `engine-video` (video generation pipeline)

### Real-Time Streaming
- WebSocket support for live TTS streaming
- Progressive audio playback (chunk-by-chunk)

### Fine-Tuned Models
- Move from RAG → fine-tuned product knowledge models
- Reduces latency, improves accuracy for large catalogs

---

**Last updated:** 2025-02-18  
**Version:** 1.0 (MVP)
