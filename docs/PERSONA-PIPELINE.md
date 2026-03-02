# Persona Extraction Pipeline

## Overview

The Echo Me Persona Extraction pipeline enables the platform to automatically analyze a user's voice clones (video or audio) to extract their unique communication style, tone, and traits. This profile is then used to prompt the LLM Chat Engine to speak exactly like the user.

## Architecture

```
┌──────────────────┐
│ Voice Clone Job  │
│ (HeyGen/Audio)   │
└────────┬─────────┘
         │ (creates video/audio file)
         v
┌──────────────────┐      ┌──────────────┐
│ Extract API      │─────>│  PostgreSQL  │
│ route.ts         │      │  (jobs tbl)  │
└────────┬─────────┘      └──────────────┘
         │
         │ pushJob("queue:persona_extract", jobId)
         v
┌──────────────────────┐
│    Redis Queue       │
│ "queue:persona_extract"│
└────────┬─────────────┘
         │
         │ BLPOP (blocking pop)
         v
┌───────────────────┐
│ Persona Worker    │
│ persona/worker.py │
└────────┬──────────┘
         │
         ├─> 1. Find latest video/audio in data/video/{user_id}/ or data/audio/
         ├─> 2. Extract audio (ffmpeg -> mp3 32kbps)
         ├─> 3. Transcribe (OpenAI Whisper)
         ├─> 4. Analyze Traits (OpenAI GPT-4o)
         │
         v
┌──────────────────┐
│  PostgreSQL      │
│ (personas tbl)   │
└──────────────────┘
```

## Components

### 1. Extract API (`web/app/api/persona/extract/route.ts`)

**Responsibilities:**
- Create extraction job for a specific persona
- Push job ID to Redis queue `queue:persona_extract`

**Request:**
```bash
POST /api/persona/extract
Content-Type: application/json

{
  "personaId": "uuid-here"
}
```

### 2. Persona Worker (`engine/persona/worker.py`)

**Responsibilities:**
- Listen on Redis queue `queue:persona_extract`
- Locate the most recent voice/video training asset for the user.
- If it's a video (`.mp4`, `.mov`), use `ffmpeg` to extract a lightweight `.mp3` audio track to fit within Whisper's 25MB limit.
- Send the audio to **OpenAI Whisper** for transcription.
- Pass the transcription to **GPT-4o** using a highly structured prompt to extract:
  - Tone
  - Vocabulary Level
  - Speech Patterns (fillers, catchphrases)
  - Selling Approach
  - Personality Traits
  - Dos & Don'ts
- Store the resulting structured JSON into `personas.auto_profile` and the raw text in `personas.transcript`.

**Database Updates:**
- `personas`: `transcript`, `auto_profile`, `updated_at`
- `jobs`: `status`, `output`, `completed_at`

### 3. Database Schema

The `personas` table holds the extracted profile:

```sql
CREATE TABLE personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  name VARCHAR(255) NOT NULL,
  voice_id VARCHAR(255),
  voice_status VARCHAR(50) DEFAULT 'idle',
  youtube_url VARCHAR(500),
  
  -- Extracted Persona Data
  transcript TEXT,
  auto_profile JSONB,
  manual_profile TEXT, -- For manual user overrides
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**JSON Structure (`auto_profile`):**
```json
{
  "name": "Speaker Name",
  "tone": "casual and energetic",
  "vocabulary_level": "intermediate",
  "speech_patterns": ["you know", "right", "basically"],
  "selling_approach": "consultative and empathetic",
  "personality_traits": ["friendly", "authoritative", "patient"],
  "common_expressions": ["let's dive in", "here's the deal"],
  "communication_style": "direct but warm",
  "dos": ["uses analogies", "asks rhetorical questions"],
  "donts": ["uses hard-sell tactics", "speaks in monotone"],
  "backstory_hints": "mentions background in tech"
}
```

## Running the Worker

**Development:**
```bash
cd engine
pip install -r requirements.txt
python -m persona.worker
```

**Docker:**
```bash
docker-compose up -d engine-persona
```

## Testing

Run the test script:
```bash
./scripts/test-persona.sh
```

## Next Steps

Now that the Persona extraction and the RAG queries are built, the final step is to unify them in the **Chat Engine** (`channels/telegram_bot.py` and Web UI Chat), where a prompt is constructed matching:
1. The `auto_profile` extracted traits (to set the AI's system prompt)
2. The RAG retrieved product chunks (to inject factual context)
3. The HeyGen / ElevenLabs output API (for voice synthesis)
