# Echo Me - External Integrations

## Overview

Echo Me integrates with external services for voice cloning, transcription, LLM generation, messaging, and authentication.

---

## 1) ElevenLabs Integration (Voice Cloning + TTS)

### Purpose
- Clone user voice from sample audio
- Generate TTS responses in cloned voice

### Auth
- Header: `xi-api-key: {ELEVENLABS_API_KEY}`

### Core Endpoints
- `POST /v1/voices/add` — Instant voice clone
- `DELETE /v1/voices/{voice_id}` — Delete cloned voice
- `GET /v1/voices` — List voices
- `POST /v1/text-to-speech/{voice_id}` — Generate speech

### Instant Cloning Request (Example)

```http
POST https://api.elevenlabs.io/v1/voices/add
Content-Type: multipart/form-data
xi-api-key: ********

name=John Clone
description=Echo Me persona
files[]=sample_1.wav
files[]=sample_2.wav
```

### TTS Request (Example)

```json
{
  "text": "Great question! We do have waterproof notebooks.",
  "model_id": "eleven_multilingual_v2",
  "voice_settings": {
    "stability": 0.5,
    "similarity_boost": 0.75,
    "style": 0,
    "use_speaker_boost": true
  }
}
```

### Rate Limits / Pricing (Indicative)
- Rate limits: roughly a few req/s depending plan
- Billing by character usage
- Typical MVP cost driver: TTS volume, not cloning

### Failure Modes
- 402: quota exceeded
- 429: throttled
- 5xx: transient errors

### Best Practices
- Retry with exponential backoff for 429/5xx
- Cache repeated short phrases
- Keep responses concise to reduce character costs

---

## 2) YouTube / yt-dlp Integration

### Purpose
- Download source audio from YouTube URL

### Tooling
- `yt-dlp` CLI or Python wrapper
- `ffmpeg` post-process for audio extraction

### Recommended Download Options

```bash
yt-dlp \
  --format bestaudio/best \
  --no-playlist \
  --output "data/audio/%(id)s.%(ext)s" \
  "https://youtube.com/watch?v=..."
```

### Format Selection
- Prefer `bestaudio`
- Convert to WAV for cloning/transcription pipeline

### Risks
- Region restrictions
- Copyright or unavailable videos
- Long videos increase processing costs/time

---

## 3) OpenAI Whisper Integration

### Purpose
- Transcribe downloaded audio into text for persona analysis

### Options
- Open-source Whisper locally (`openai-whisper`)
- API-based transcription (if preferred)

### Key Parameters
- `model`: base/small/medium/large
- `language`: auto or explicit (`en`, `pt`, etc.)
- `word_timestamps`: true for deeper analysis

### Example (Local)

```python
import whisper
m = whisper.load_model("base")
out = m.transcribe("audio.wav", language="en", word_timestamps=True)
```

### Trade-offs
- Local: no per-call cost, higher infra load
- API: easier scaling, usage cost

---

## 4) LLM Providers (OpenAI, Anthropic)

### Purpose
- Persona extraction
- Chat generation with persona + RAG context

### Model Selection

| Use case | OpenAI | Anthropic |
|---|---|---|
| Persona extraction | gpt-4o | claude-sonnet-4-5 |
| Chat generation | gpt-4o | claude-sonnet-4-5 |
| Lower-cost fallback | gpt-4o-mini | claude-haiku |

### Token Limits (Practical)
- Keep prompt context compact and deterministic
- RAG context target: top 5 chunks, summarized if needed

### Failure Modes
- 429 throttling
- context length exceeded
- transient 5xx

### Safety/Quality Rules
- Strict grounding instruction
- citation requirement
- fallback if insufficient context

---

## 5) Telegram Bot API Integration

### Purpose
- Receive customer messages
- Send voice replies (`sendVoice`) and optional text fallback

### Setup
1. Create bot with BotFather
2. Store token in `TELEGRAM_BOT_TOKEN`
3. Configure webhook:

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://your-domain.com/webhook/telegram" \
  -d "secret_token=your-secret"
```

### Incoming Update
- Endpoint: `POST /webhook/telegram`
- Verify `X-Telegram-Bot-Api-Secret-Token`

### Send Voice Message

```bash
curl -F chat_id=123456 \
     -F voice=@reply.ogg \
     "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendVoice"
```

### Message Types Used
- `message.text` input
- `sendVoice` output
- Optional `sendMessage` fallback

### Operational Notes
- Convert TTS output to OGG Opus before sending
- Handle duplicate updates idempotently (`update_id`)

---

## 6) Google OAuth Integration

### Purpose
- User authentication for web dashboard

### Stack
- NextAuth.js with Google provider

### Required Env
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`

### Scopes
- `openid`
- `email`
- `profile`

### Flow
```
User clicks Sign in with Google
   -> Google consent
   -> callback /api/auth/callback/google
   -> JWT session cookie issued
   -> dashboard access
```

### Notes
- Keep OAuth callback URL consistent with deployed domain
- Use secure cookies in production

---

## 7) Future Integrations

### Email (SMTP/IMAP)
- Inbound via IMAP polling or provider webhooks
- Outbound via SMTP send
- Parse thread history and map to `clients`

### WhatsApp
- WhatsApp Business API / Cloud API
- Webhook-based incoming events
- Audio message send support (OGG/Opus compatible)

### Considerations
- Per-channel compliance and policy constraints
- New channel adapters should implement a common interface:

```python
class ChannelAdapter:
    def parse_incoming(self, payload): ...
    def send_text(self, recipient, text): ...
    def send_audio(self, recipient, audio_path): ...
```

---

## 8) Secrets and Configuration Matrix

| Service | Required Env Var |
|---|---|
| ElevenLabs | `ELEVENLABS_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| Telegram | `TELEGRAM_BOT_TOKEN` |
| Google OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |

### Security Rules
- Never log raw secrets
- Encrypt user-provided API keys at rest
- Rotate keys periodically

---

**Last updated:** 2025-02-18  
**Version:** 1.0 (MVP)
