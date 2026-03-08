# Echo Me Chat Engine

The Chat Engine is the orchestrator that brings together RAG, Persona, and Voice to generate personalized responses.

## Architecture

```
User Message
    ↓
Next.js API (/api/chat)
    ↓
PostgreSQL (create job)
    ↓
Redis Queue (queue:chat)
    ↓
Chat Worker
    ├─→ RAG Query Service (get context)
    ├─→ PostgreSQL (load persona)
    ├─→ OpenAI (generate response)
    └─→ ElevenLabs (optional TTS)
    ↓
PostgreSQL (update job with result)
    ↓
Frontend polls /api/chat/[id]
    ↓
Display response + audio
```

## Components

### 1. Chat Engine (`engine/chat/engine.py`)

Main orchestrator class with methods:

- **`query_rag()`** - Query RAG service for product knowledge
- **`load_persona()`** - Load user's persona profile from DB
- **`build_system_prompt()`** - Combine persona + RAG context into system prompt
- **`generate_response()`** - Call OpenAI with system prompt + message
- **`text_to_speech()`** - Convert response to audio with cloned voice
- **`chat()`** - Main method that orchestrates full pipeline

### 2. Chat Worker (`engine/chat/worker.py`)

Redis-based async worker that:
1. Pulls jobs from `queue:chat` (BLPOP pattern)
2. Updates job status to `processing`
3. Calls `ChatEngine.chat()`
4. Updates job status to `completed` or `failed` with result

### 3. API Endpoints

#### `POST /api/chat`
Create a chat job

**Request:**
```json
{
  "message": "What products do you have for small businesses?",
  "product_id": 5,
  "client_id": 10,
  "generate_audio": false,
  "conversation_history": [
    {"role": "user", "content": "Hello"},
    {"role": "assistant", "content": "Hi! How can I help?"}
  ]
}
```

**Response:**
```json
{
  "job_id": 123
}
```

#### `GET /api/chat/[id]`
Get job status and result

**Response (processing):**
```json
{
  "id": 123,
  "status": "processing",
  "result_data": null,
  "error_message": null,
  "created_at": "2026-03-03T10:00:00Z",
  "completed_at": null
}
```

**Response (completed):**
```json
{
  "id": 123,
  "status": "completed",
  "result_data": {
    "response_text": "We have several great options for small businesses...",
    "audio_path": "/tmp/chat_1_10.mp3",
    "rag_context_count": 5,
    "persona_name": "Sales Joe"
  },
  "error_message": null,
  "created_at": "2026-03-03T10:00:00Z",
  "completed_at": "2026-03-03T10:00:05Z"
}
```

## How It Works

### 1. RAG Context Retrieval

The engine queries the RAG service to find relevant product knowledge:

```python
rag_results = self.query_rag(
    user_id=1,
    query="What products do you have?",
    product_id=5,  # optional: scope to specific product
    top_k=5
)
# Returns: [{"text": "...", "score": 0.85, ...}, ...]
```

### 2. Persona Loading

Loads the user's persona profile (auto-extracted + manual overrides):

```python
persona = self.load_persona(db_conn, user_id=1)
# Returns: {
#   "name": "Sales Joe",
#   "voice_id": "abc123",
#   "auto_profile": {
#     "tone": "friendly",
#     "vocabulary_level": "intermediate",
#     "speech_patterns": ["uses metaphors", "asks questions"],
#     "selling_approach": "consultative"
#   },
#   "manual_profile": {...}  # overrides
# }
```

### 3. System Prompt Construction

Combines persona traits + RAG context into a system prompt:

```
You are a sales assistant representing Sales Joe.

PERSONALITY PROFILE:
- Tone: friendly
- Vocabulary Level: intermediate
- Selling Approach: consultative

SPEECH PATTERNS:
- Uses metaphors
- Asks clarifying questions
- Friendly and approachable

ALWAYS:
- Listen actively to customer needs
- Provide clear, honest information
- Follow up on questions

NEVER:
- Pressure customers
- Make false promises
- Use technical jargon

PRODUCT KNOWLEDGE:
- Product X is ideal for small businesses
- Features include...
- Pricing starts at...

Your task: Answer the customer's question in YOUR voice.
```

### 4. LLM Generation

Calls OpenAI with system prompt + conversation history:

```python
response_text = self.generate_response(
    message="What products do you have?",
    system_prompt=system_prompt,
    conversation_history=[...],
    model="gpt-4o-mini"
)
```

### 5. Optional TTS

If `generate_audio=True` and user has a cloned voice:

```python
audio_path = self.text_to_speech(
    text=response_text,
    voice_id=persona["voice_id"],
    output_path="/tmp/chat_1_10.mp3"
)
```

## Running the Worker

### Development
```bash
cd engine
python -m chat.worker
```

### Docker Compose
```yaml
chat-worker:
  build: ./engine
  command: python -m chat.worker
  environment:
    - DATABASE_URL=postgresql://echo:echo@db:5432/echome
    - REDIS_URL=redis://redis:6379
    - OPENAI_API_KEY=${OPENAI_API_KEY}
    - ELEVENLABS_API_KEY=${ELEVENLABS_API_KEY}
  depends_on:
    - db
    - redis
    - rag-query
```

## Testing

### Test Script (`scripts/test-chat.sh`)

```bash
#!/bin/bash
# Test chat engine end-to-end

USER_ID=1
MESSAGE="What products do you have for small businesses?"

# 1. Create job
JOB_RESPONSE=$(curl -s -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"$MESSAGE\"}")

JOB_ID=$(echo $JOB_RESPONSE | jq -r '.job_id')
echo "Created job: $JOB_ID"

# 2. Poll for completion
while true; do
  STATUS_RESPONSE=$(curl -s http://localhost:3000/api/chat/$JOB_ID)
  STATUS=$(echo $STATUS_RESPONSE | jq -r '.status')
  
  echo "Status: $STATUS"
  
  if [ "$STATUS" = "completed" ]; then
    echo "✅ Completed!"
    echo $STATUS_RESPONSE | jq '.result_data'
    break
  elif [ "$STATUS" = "failed" ]; then
    echo "❌ Failed!"
    echo $STATUS_RESPONSE | jq '.error_message'
    break
  fi
  
  sleep 2
done
```

### Manual Testing

```bash
# 1. Start RAG query service
cd engine
python -m rag.query_service

# 2. Start chat worker
python -m chat.worker

# 3. Create chat job via API
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What products do you have?",
    "generate_audio": false
  }'

# 4. Check job status
curl http://localhost:3000/api/chat/123
```

## Integration with Telegram Bot

The Telegram bot can use the chat engine like this:

```python
# engine/channels/telegram_bot.py

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_telegram_id = update.effective_user.id
    message = update.message.text
    
    # Map Telegram user to Echo Me user
    user_id = get_user_id_from_telegram(user_telegram_id)
    
    # Create chat job
    job_data = {
        "job_id": create_job_in_db(user_id, 'chat', {...}),
        "user_id": user_id,
        "message": message,
        "generate_audio": True,  # Always generate audio for Telegram
    }
    
    # Push to queue
    redis_client.rpush("queue:chat", json.dumps(job_data))
    
    # Send "typing..." indicator
    await context.bot.send_chat_action(
        chat_id=update.effective_chat.id,
        action="typing"
    )
    
    # Poll for result
    result = await poll_job_until_complete(job_data["job_id"])
    
    # Send text response
    await update.message.reply_text(result["response_text"])
    
    # Send audio if generated
    if result.get("audio_path"):
        await update.message.reply_voice(
            voice=open(result["audio_path"], 'rb')
        )
```

## Environment Variables

```bash
# Required
OPENAI_API_KEY=sk-...
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# Optional (for TTS)
ELEVENLABS_API_KEY=...

# Optional (RAG service URL)
RAG_SERVICE_URL=http://localhost:8001  # default
```

## Performance

- **RAG Query**: ~200-500ms (embedding + ChromaDB search)
- **Persona Load**: ~50ms (PostgreSQL query)
- **LLM Generation**: ~1-3s (OpenAI API)
- **TTS Generation**: ~2-5s (ElevenLabs API)

**Total**: ~3-9s per chat response (with audio)

## Error Handling

The engine gracefully degrades when services are unavailable:

- **RAG unavailable**: Proceeds without product context
- **Persona not found**: Uses generic system prompt
- **LLM fails**: Returns generic error message
- **TTS fails**: Returns text response only

## Next Steps

1. ✅ Chat engine implemented
2. [ ] Frontend chat UI component
3. [ ] Telegram bot integration
4. [ ] Conversation history tracking in DB
5. [ ] WebSocket for real-time streaming
6. [ ] Voice input (Whisper STT)
7. [ ] Analytics dashboard
