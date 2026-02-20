# Echo Me - Implementation Blueprint (MVP)

## Objective
Deliver an MVP that can:
1. Authenticate users via Google OAuth
2. Clone voice from YouTube
3. Extract persona profile
4. Ingest product catalogs for RAG
5. Answer Telegram queries with persona-grounded voice replies

---

## Phase-by-Phase Plan (Estimated Hours)

## Phase 1 - Foundation (32h)
- Project scaffolding (Next.js + Python workers) — 6h
- Docker Compose baseline (web, db, redis, chroma) — 6h
- PostgreSQL schema + migrations — 8h
- NextAuth Google OAuth setup — 6h
- Dashboard shell + navigation — 6h

**Exit criteria:** login works; DB ready; app runs via docker-compose.

---

## Phase 2 - Voice + Persona Pipeline (44h)
- YouTube URL UI + API trigger — 4h
- yt-dlp downloader worker — 6h
- ffmpeg cleanup pipeline — 6h
- ElevenLabs instant cloning integration — 8h
- Whisper transcription worker — 6h
- Persona extraction prompt + parser — 8h
- Persona editor UI (manual overrides) — 6h

**Exit criteria:** voice cloned + persona profile generated and editable.

---

## Phase 3 - Product RAG (36h)
- Product upload endpoint/UI (CSV/PDF/TXT) — 6h
- Parsing + normalization pipeline — 8h
- Chunking + embedding generation — 8h
- Chroma storage + metadata model — 6h
- Retrieval + rerank endpoint — 8h

**Exit criteria:** product corpus searchable with relevant hits.

---

## Phase 4 - Chat Engine + Telegram (40h)
- Prompt assembly (persona + RAG + client context) — 8h
- LLM response endpoint — 6h
- TTS generation + OGG conversion — 8h
- Telegram webhook receiver + adapter — 8h
- Outbound sendVoice flow + retries — 6h
- Conversation/client persistence — 4h

**Exit criteria:** Telegram question -> grounded answer -> voice reply.

---

## Phase 5 - Hardening + Deploy (28h)
- Error handling / job retries / timeout policy — 8h
- Rate limiting + abuse controls — 4h
- Logging + metrics baseline — 6h
- Prod docker-compose tuning + env docs — 6h
- Smoke tests + launch checklist — 4h

**Exit criteria:** stable MVP with operational runbook.

---

## Total Estimated Effort
**180 hours** (~5-6 weeks for 1 engineer, or 2-3 weeks for 2 engineers).

---

## File-by-File Implementation Order

### Web (Next.js)
1. `web/app/page.tsx` (landing + auth CTA)
2. `web/app/dashboard/page.tsx` (dashboard shell)
3. `web/app/dashboard/voice/page.tsx`
4. `web/app/dashboard/persona/page.tsx`
5. `web/app/dashboard/products/page.tsx`
6. `web/app/dashboard/clients/page.tsx`
7. `web/app/dashboard/settings/page.tsx`
8. `web/app/api/auth/[...nextauth]/route.ts`
9. `web/app/api/voice/clone/route.ts`
10. `web/app/api/voice/status/[jobId]/route.ts`
11. `web/app/api/persona/[id]/route.ts`
12. `web/app/api/products/upload/route.ts`
13. `web/app/api/products/route.ts`
14. `web/app/api/clients/route.ts`
15. `web/app/api/chat/query/route.ts`
16. `web/app/webhook/telegram/route.ts`
17. `web/lib/db.ts`, `web/lib/queue.ts`, `web/lib/auth.ts`

### Engine (Python)
1. `engine/requirements.txt`
2. `engine/voice/download.py`
3. `engine/voice/extract.py`
4. `engine/voice/clone.py`
5. `engine/persona/transcribe.py`
6. `engine/persona/analyze.py`
7. `engine/persona/profile.py`
8. `engine/rag/ingest.py`
9. `engine/rag/vectordb.py`
10. `engine/rag/query.py`
11. `engine/llm/chain.py`
12. `engine/llm/tts.py`
13. `engine/channels/telegram.py`
14. `engine/workers/*.py` (job consumers)

### Infra / DB
1. `docker-compose.yml`
2. `db/migrations/*`
3. `.env.example` validation
4. `scripts/bootstrap.sh`

---

## Dependencies Between Components

```
Auth + DB schema
    ├─► Dashboard pages
    ├─► API key storage
    └─► Persona ownership model

Voice pipeline
    └─► Requires YouTube download + ffmpeg + ElevenLabs key

Persona extraction
    └─► Requires transcription output

RAG retrieval
    └─► Requires ingestion completed + vectors present

Chat response
    ├─► Requires persona (active)
    ├─► Requires RAG context
    └─► Requires LLM + TTS keys

Telegram channel
    └─► Requires chat response pipeline complete
```

---

## Critical Path Analysis

Critical path items (must complete in sequence):
1. DB schema + auth
2. Voice pipeline end-to-end
3. Persona extraction + profile persistence
4. RAG ingestion + retrieval
5. Prompt assembly and LLM response
6. TTS + Telegram sendVoice

Delays in (2), (4), or (6) block MVP launch.

---

## Risk Assessment

## 1) API Limits / Quotas
- **Risk:** ElevenLabs or LLM quota exhaustion
- **Impact:** No voice replies or degraded quality
- **Mitigation:** usage caps, alerts, fallback to text mode

## 2) Cost Growth
- **Risk:** High token + TTS costs with increased usage
- **Impact:** Margin erosion
- **Mitigation:** response length limits, caching, model tier routing

## 3) Latency
- **Risk:** Slow end-to-end response (>10s)
- **Impact:** Poor user experience
- **Mitigation:** optimize top_k, use faster models for simple queries, async pipeline tuning

## 4) YouTube Source Quality
- **Risk:** noisy audio harms cloning quality
- **Impact:** unnatural voice output
- **Mitigation:** sample quality checks, reject poor sources, allow re-upload

## 5) Hallucination
- **Risk:** incorrect product claims
- **Impact:** trust/compliance issues
- **Mitigation:** grounding constraints, citation requirement, fallback if unknown

## 6) Webhook Reliability
- **Risk:** missed Telegram updates
- **Impact:** lost leads/messages
- **Mitigation:** idempotent update handling, retry, dead-letter queue

---

## Testing Strategy by Component

## Auth + Web
- Unit: auth callbacks, middleware guards
- Integration: OAuth sign-in/out, session persistence
- E2E: protected dashboard routes

## Voice Pipeline
- Unit: URL validation, ffmpeg command builder
- Integration: download -> cleanup -> clone with mock APIs
- Quality: generated sample audibility check

## Persona Engine
- Unit: prompt template + JSON parser validation
- Integration: transcript -> persona JSON -> DB save
- Regression: deterministic extraction snapshots

## RAG Engine
- Unit: parser/chunker correctness
- Integration: ingest file -> vector query success
- Eval: Recall@10 benchmark set

## Chat + TTS
- Unit: prompt assembly and token budget rules
- Integration: query -> LLM -> tts -> ogg file
- Latency test: p95 < 8s target

## Telegram Adapter
- Unit: update parser and command routing
- Integration: webhook -> reply sendVoice
- Reliability: duplicate update dedup test

---

## Definition of Done (MVP)

A build is MVP-ready when all conditions below are true:

1. User can sign in with Google and access dashboard
2. User can submit YouTube URL and obtain a usable cloned voice
3. System auto-generates persona profile and user can edit manual overrides
4. User can upload product catalog (CSV/PDF/TXT), ingestion completes, vectors available
5. Telegram webhook receives questions and returns grounded persona response
6. Responses can be sent as OGG Opus voice messages
7. API keys stored encrypted and never leaked in logs/responses
8. Job status visible with clear failure reasons
9. Basic rate limiting and retries in place
10. Deployment documented and reproducible with Docker Compose

---

## Launch Checklist
- [ ] Production env vars set
- [ ] OAuth callback URL verified
- [ ] Telegram webhook secret enabled
- [ ] API usage alerts configured
- [ ] Daily DB backup enabled
- [ ] Smoke tests passed
- [ ] Rollback plan documented

---

**Last updated:** 2025-02-18  
**Version:** 1.0 (MVP)
