# Echo Me — Roadmap

## Phase 1: Foundation (Week 1-2)
- [ ] Next.js project setup + Tailwind + shadcn/ui
- [ ] Google OAuth (NextAuth.js)
- [ ] PostgreSQL schema (users, personas, products, clients)
- [ ] Dashboard layout (sidebar nav)
- [ ] Settings page (API keys encrypted storage)
- [ ] Docker Compose (web + db + vector db)

## Phase 2: Voice + Persona Pipeline (Week 2-3)
- [ ] YouTube URL input page
- [ ] yt-dlp audio + video download worker
- [ ] ffmpeg audio extraction + cleanup
- [ ] ElevenLabs voice cloning API integration
- [ ] Voice status tracking (processing → ready)
- [ ] Audio preview on dashboard
- [ ] Whisper transcription of YouTube audio
- [ ] LLM persona analysis (speech patterns, tone, expressions)
- [ ] Auto-generated persona profile (stored in DB)
- [ ] Persona editor page (rich text, manual overrides)
- [ ] Persona fields: name, role, personality, tone, do's/don'ts, expressions, context

## Phase 3: Product RAG (Week 3-4)
- [ ] Product upload (CSV, PDF, plain text)
- [ ] Document parsing + chunking
- [ ] Embedding generation (OpenAI/local)
- [ ] ChromaDB vector storage
- [ ] RAG query endpoint
- [ ] Product management UI (list, delete, search)

## Phase 4: Chat Engine (Week 4-5)
- [ ] LLM chain (context + RAG + persona prompt)
- [ ] TTS output via ElevenLabs cloned voice
- [ ] Telegram bot setup + webhook
- [ ] Audio reply flow (question → LLM → TTS → send audio)
- [ ] Client list upload + client-aware responses

## Phase 5: Polish & Deploy (Week 5-6)
- [ ] Error handling + retry logic
- [ ] Rate limiting
- [ ] Usage tracking / basic analytics
- [ ] Production Docker setup
- [ ] Deploy guide (VPS / Railway / Vercel + workers)
