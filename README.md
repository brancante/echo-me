# Echo Me 🪞🎙️

**Create a virtual persona that talks, sells, and answers like you — but never sleeps.**

## What It Does

Echo Me clones a person's voice and product knowledge to create an AI-powered virtual sales rep that:
- Answers product questions via Telegram (audio replies in the person's voice)
- Replies to emails with personalized product recommendations
- Uses RAG over product catalogs for accurate, grounded responses
- Speaks with a custom ElevenLabs voice cloned from YouTube videos

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Landing Page                     │
│         (Next.js + Google OAuth)                  │
│                                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ YouTube  │ │ Products │ │ API Keys Config  │  │
│  │ URL Input│ │ Upload   │ │ Telegram/11Labs/ │  │
│  │          │ │ (CSV/PDF)│ │ LLM              │  │
│  └────┬─────┘ └────┬─────┘ └────────┬─────────┘  │
│       │             │                │             │
└───────┼─────────────┼────────────────┼─────────────┘
        │             │                │
        ▼             ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Voice Clone  │ │ RAG Engine   │ │ Channel Hub  │
│ Pipeline     │ │              │ │              │
│              │ │ • Chunk docs │ │ • Telegram   │
│ • Download   │ │ • Embed      │ │   Bot        │
│   YouTube    │ │ • Vector DB  │ │ • Email      │
│   audio      │ │   (Chroma/   │ │   (future)   │
│ • Extract    │ │    Qdrant)   │ │              │
│   voice      │ │ • Query +    │ │              │
│ • Clone via  │ │   Rerank     │ │              │
│   11Labs API │ │              │ │              │
└──────────────┘ └──────────────┘ └──────────────┘
        │             │                │
        └─────────────┼────────────────┘
                      ▼
              ┌──────────────┐
              │  LLM Engine  │
              │              │
              │ • Context +  │
              │   RAG hits   │
              │ • Generate   │
              │   response   │
              │ • TTS via    │
              │   11Labs     │
              │   (cloned    │
              │    voice)    │
              └──────────────┘
```

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 + Tailwind + shadcn/ui |
| Auth | NextAuth.js (Google OAuth) |
| Backend | Next.js API Routes + Python workers |
| Database | PostgreSQL (Supabase or local) |
| Vector DB | ChromaDB (local) or Qdrant |
| Voice Clone | ElevenLabs API (Voice Cloning) |
| YouTube DL | yt-dlp |
| Audio Extract | ffmpeg |
| RAG | LangChain / LlamaIndex |
| LLM | Configurable (OpenAI / Anthropic / local) |
| TTS | ElevenLabs (cloned voice) |
| Channels | Telegram Bot API, Email (SMTP/IMAP) |
| Deployment | Docker Compose |

## Project Structure

```
echo-me/
├── README.md
├── ROADMAP.md
├── docker-compose.yml
├── .env.example
│
├── web/                    # Next.js frontend + API
│   ├── app/
│   │   ├── page.tsx        # Landing page
│   │   ├── dashboard/      # Main dashboard
│   │   │   ├── page.tsx    # Overview
│   │   │   ├── voice/      # YouTube URL + voice status
│   │   │   ├── persona/    # Persona editor (auto + manual)
│   │   │   ├── products/   # Product upload + management
│   │   │   ├── clients/    # Client list management
│   │   │   └── settings/   # API keys configuration
│   │   └── api/
│   │       ├── auth/       # NextAuth Google OAuth
│   │       ├── voice/      # Voice cloning endpoints
│   │       ├── products/   # Product CRUD + ingestion
│   │       ├── clients/    # Client CRUD
│   │       └── chat/       # LLM + RAG query endpoint
│   ├── components/
│   ├── lib/
│   └── package.json
│
├── engine/                 # Python backend workers
│   ├── voice/
│   │   ├── download.py     # yt-dlp YouTube audio download
│   │   ├── extract.py      # ffmpeg audio processing
│   │   └── clone.py        # ElevenLabs voice cloning
│   ├── persona/
│   │   ├── transcribe.py   # Whisper transcription
│   │   ├── analyze.py      # LLM persona extraction
│   │   └── profile.py      # Persona profile CRUD
│   ├── rag/
│   │   ├── ingest.py       # Document chunking + embedding
│   │   ├── query.py        # RAG retrieval + reranking
│   │   └── vectordb.py     # ChromaDB/Qdrant interface
│   ├── llm/
│   │   ├── chain.py        # LLM chain with RAG context
│   │   └── tts.py          # Text-to-speech with cloned voice
│   ├── channels/
│   │   ├── telegram.py     # Telegram bot handler
│   │   └── email.py        # Email responder (future)
│   └── requirements.txt
│
└── data/                   # Local data (gitignored)
    ├── audio/
    ├── vectors/
    └── uploads/
```

## Pipeline Flow

### 1. Voice + Persona Pipeline
```
YouTube URL → yt-dlp (download video + audio)
  ├─→ ffmpeg (extract clean audio) → ElevenLabs API (voice clone) → Voice ID
  └─→ Whisper (transcribe) → LLM Analysis:
        ├─ Speech patterns (catchphrases, filler words, slang)
        ├─ Tone & energy (formal/casual, enthusiastic/calm)
        ├─ Selling style (storytelling, technical, emotional)
        ├─ Common expressions & vocabulary
        └─ → Auto-generated Persona Profile (editable by user)
```

### 2. Product Ingestion Pipeline
```
CSV/PDF Upload → Parse & chunk → Generate embeddings
→ Store in Vector DB → Ready for RAG queries
```

### 3. Query Pipeline (Telegram/Email)
```
Incoming message → Extract question → RAG search (top-k products)
→ Build prompt (persona context + product hits + client info)
→ LLM generates response → ElevenLabs TTS (cloned voice)
→ Send audio reply via Telegram
```

## Persona System

The persona is the soul of Echo Me. It defines HOW the clone talks, not just WHAT it knows.

### Auto-extracted from YouTube (LLM analysis of transcripts):
- **Speech patterns**: catchphrases, filler words, recurring expressions
- **Vocabulary**: technical level, slang, preferred terms
- **Tone**: formal/casual, energetic/calm, humor style
- **Selling style**: storytelling, data-driven, emotional appeal
- **Greeting/closing habits**: how they open and close conversations

### Manually editable (dashboard Persona page):
- **Name & role**: "João, founder of XYZ"
- **Personality traits**: friendly, direct, technical, etc.
- **Tone of voice guidelines**: "Always enthusiastic about new products"
- **Do's and Don'ts**: "Never badmouth competitors", "Always mention free shipping"
- **Custom expressions**: phrases the person always uses
- **Context/backstory**: company history, personal story, values
- **Language**: primary language, bilingual behavior

The auto-extracted profile is a **starting point** — the user refines it in the dashboard with a rich text editor. The final persona prompt is injected into every LLM call.

## MVP Scope (v0.1)

- [ ] Landing page with Google OAuth
- [ ] Dashboard with YouTube URL input
- [ ] Voice cloning from YouTube audio
- [ ] **Persona extraction from YouTube transcripts**
- [ ] **Persona editor page (auto + manual fields)**
- [ ] Product CSV upload + RAG ingestion
- [ ] Basic Telegram bot that answers product questions
- [ ] Audio replies using cloned voice
- [ ] API keys settings page (Telegram, 11Labs, LLM)

## Future (v0.2+)

- [ ] Client-aware personalization (knows who's asking)
- [ ] Email channel integration
- [ ] WhatsApp integration
- [ ] Multi-persona support (multiple clones)
- [ ] Analytics dashboard (queries, conversion, satisfaction)
- [ ] Video response generation (HeyGen/D-ID integration)
- [ ] Fine-tuned product knowledge (beyond RAG)
