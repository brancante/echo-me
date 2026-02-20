# Echo Me - API Specification

## Overview

Echo Me exposes a REST API through Next.js API routes for web dashboard operations and a webhook API for external channels (Telegram). All authenticated endpoints require a valid JWT session cookie.

**Base URL (Development):** `http://localhost:3000/api`  
**Base URL (Production):** `https://echome.example.com/api`

---

## Authentication

### Google OAuth Flow

#### `GET /api/auth/signin`
Initiates Google OAuth 2.0 flow (NextAuth.js).

**Response:**
- Redirects to Google OAuth consent screen
- On success: Redirects to `/dashboard` with session cookie

#### `GET /api/auth/callback/google`
OAuth callback handler (automatically handled by NextAuth.js).

**Query Parameters:**
- `code`: Authorization code from Google
- `state`: CSRF protection token

**Response:**
- Sets `next-auth.session-token` cookie (JWT)
- Redirects to `/dashboard`

#### `GET /api/auth/session`
Returns current user session.

**Response:**
```json
{
  "user": {
    "id": "usr_abc123",
    "email": "user@example.com",
    "name": "John Doe",
    "image": "https://lh3.googleusercontent.com/..."
  },
  "expires": "2025-03-20T12:00:00.000Z"
}
```

**Errors:**
- `401 Unauthorized`: No active session

#### `POST /api/auth/signout`
Ends user session.

**Response:**
```json
{
  "success": true
}
```

---

## Voice API

### `POST /api/voice/clone`
Starts voice cloning from YouTube URL.

**Headers:**
```
Authorization: Bearer {session_token}
Content-Type: application/json
```

**Request:**
```json
{
  "youtube_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "persona_name": "John Sales Expert",
  "language": "en"
}
```

**Response (202 Accepted):**
```json
{
  "job_id": "job_voice_abc123",
  "status": "pending",
  "persona_id": "persona_def456",
  "estimated_completion_seconds": 180,
  "message": "Voice cloning started. Check /api/voice/status/{job_id} for progress."
}
```

**Errors:**
- `400 Bad Request`: Invalid YouTube URL or missing fields
- `401 Unauthorized`: No session
- `402 Payment Required`: ElevenLabs API quota exceeded
- `422 Unprocessable Entity`: YouTube video unavailable

**Example Error:**
```json
{
  "error": "invalid_url",
  "message": "YouTube URL is invalid or video is private",
  "details": {
    "url": "https://invalid.com",
    "youtube_error": "Video unavailable"
  }
}
```

---

### `GET /api/voice/status/{job_id}`
Polls voice cloning job status.

**Response (Processing):**
```json
{
  "job_id": "job_voice_abc123",
  "status": "processing",
  "progress": 45,
  "stage": "extracting_audio",
  "stages": [
    {"name": "downloading_video", "status": "completed", "duration_seconds": 30},
    {"name": "extracting_audio", "status": "processing", "duration_seconds": null},
    {"name": "cloning_voice", "status": "pending", "duration_seconds": null}
  ],
  "created_at": "2025-02-18T10:00:00Z",
  "updated_at": "2025-02-18T10:01:30Z"
}
```

**Response (Completed):**
```json
{
  "job_id": "job_voice_abc123",
  "status": "completed",
  "progress": 100,
  "result": {
    "voice_id": "21m00Tcm4TlvDq8ikWAM",
    "persona_id": "persona_def456",
    "audio_sample_url": "https://storage.echome.com/samples/persona_def456.mp3",
    "duration_seconds": 185
  },
  "completed_at": "2025-02-18T10:03:05Z"
}
```

**Response (Failed):**
```json
{
  "job_id": "job_voice_abc123",
  "status": "failed",
  "error": {
    "code": "elevenlabs_quota_exceeded",
    "message": "ElevenLabs API quota exceeded. Please upgrade your plan.",
    "retry_after_seconds": null
  },
  "failed_at": "2025-02-18T10:02:00Z"
}
```

**Status Values:**
- `pending`: Job queued
- `processing`: Job in progress
- `completed`: Success
- `failed`: Error occurred
- `cancelled`: User cancelled

---

### `GET /api/voice/preview/{persona_id}`
Returns audio preview of cloned voice.

**Query Parameters:**
- `text` (optional): Custom text to preview (max 100 chars). Default: "Hello, this is my cloned voice."

**Response:**
```json
{
  "persona_id": "persona_def456",
  "audio_url": "https://storage.echome.com/previews/persona_def456_preview.mp3",
  "expires_at": "2025-02-18T11:00:00Z",
  "text": "Hello, this is my cloned voice."
}
```

**Errors:**
- `404 Not Found`: Persona not found or voice not cloned yet

---

### `DELETE /api/voice/{persona_id}`
Deletes cloned voice from ElevenLabs and removes persona.

**Response:**
```json
{
  "success": true,
  "message": "Voice deleted successfully",
  "persona_id": "persona_def456"
}
```

**Errors:**
- `404 Not Found`: Persona not found
- `409 Conflict`: Persona has active conversations

---

## Persona API

### `GET /api/persona/{persona_id}`
Fetches persona profile (auto-extracted + manual overrides).

**Response:**
```json
{
  "id": "persona_def456",
  "user_id": "usr_abc123",
  "name": "John Sales Expert",
  "role": "Founder & CEO",
  "voice_id": "21m00Tcm4TlvDq8ikWAM",
  "youtube_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "language": "en",
  "profile": {
    "auto_extracted": {
      "speech_patterns": {
        "catchphrases": ["Let me tell you", "Here's the thing", "Absolutely"],
        "filler_words": ["um", "you know", "like"],
        "expressions": ["That's a great question", "I'm glad you asked"]
      },
      "vocabulary": {
        "level": "professional",
        "style": "conversational",
        "technical_terms": ["ROI", "conversion rate", "customer lifetime value"],
        "slang": ["game-changer", "no-brainer"]
      },
      "tone": {
        "formality": "casual-professional",
        "energy": "enthusiastic",
        "humor": "occasional, self-deprecating",
        "empathy": "high"
      },
      "selling_style": {
        "approach": "storytelling + data",
        "primary_methods": ["case studies", "social proof", "problem-agitation-solution"],
        "objection_handling": "acknowledge concerns, then reframe with benefits"
      },
      "greeting_closing": {
        "typical_greetings": ["Hey there!", "Thanks for reaching out!"],
        "typical_closings": ["Let me know if you have questions!", "Happy to help!"]
      }
    },
    "manual_overrides": {
      "personality_traits": ["Friendly", "Direct", "Technical expert", "Patient teacher"],
      "tone_guidelines": "Always enthusiastic about new products. Avoid being pushy.",
      "dos": [
        "Always mention free shipping on orders over $100",
        "Highlight our 30-day return policy",
        "Suggest complementary products when relevant"
      ],
      "donts": [
        "Never badmouth competitors",
        "Don't make promises about delivery times",
        "Avoid overly technical jargon unless asked"
      ],
      "custom_expressions": [
        "Our customers love this one!",
        "Let me walk you through the details"
      ],
      "backstory": "Founded the company in 2018 after 10 years in retail. Passionate about helping small businesses grow.",
      "context_notes": "Company specializes in eco-friendly office supplies. Values: sustainability, affordability, quality."
    }
  },
  "status": "active",
  "created_at": "2025-02-18T10:00:00Z",
  "updated_at": "2025-02-18T12:30:00Z"
}
```

---

### `PATCH /api/persona/{persona_id}`
Updates manual overrides for persona profile.

**Request:**
```json
{
  "manual_overrides": {
    "personality_traits": ["Friendly", "Technical expert"],
    "tone_guidelines": "Be concise and professional",
    "dos": ["Always offer a discount code"],
    "donts": ["Never rush the customer"],
    "custom_expressions": ["That's a great choice!"],
    "backstory": "Updated backstory...",
    "context_notes": "Additional context..."
  }
}
```

**Response:**
```json
{
  "success": true,
  "persona_id": "persona_def456",
  "updated_fields": ["manual_overrides"],
  "updated_at": "2025-02-18T13:00:00Z"
}
```

**Errors:**
- `400 Bad Request`: Invalid JSON structure
- `404 Not Found`: Persona not found

---

### `POST /api/persona/{persona_id}/reanalyze`
Re-runs LLM persona extraction (useful after uploading more YouTube videos).

**Request:**
```json
{
  "additional_youtube_urls": [
    "https://www.youtube.com/watch?v=another_video"
  ],
  "merge_strategy": "append"
}
```

**Parameters:**
- `merge_strategy`: `"replace"` (discard old) or `"append"` (merge with existing)

**Response (202 Accepted):**
```json
{
  "job_id": "job_persona_xyz789",
  "status": "pending",
  "message": "Persona re-analysis started"
}
```

---

## Products API

### `POST /api/products/upload`
Uploads product catalog (CSV, PDF, or plain text).

**Request (Multipart Form-Data):**
```
POST /api/products/upload
Content-Type: multipart/form-data

file: [product_catalog.csv]
catalog_name: "Spring 2025 Collection"
```

**Response (202 Accepted):**
```json
{
  "job_id": "job_products_abc123",
  "catalog_id": "catalog_xyz",
  "status": "pending",
  "file_name": "product_catalog.csv",
  "file_size_bytes": 524288,
  "estimated_completion_seconds": 60
}
```

**Errors:**
- `400 Bad Request`: Invalid file format
- `413 Payload Too Large`: File exceeds 50MB limit
- `422 Unprocessable Entity`: CSV parsing failed

---

### `GET /api/products`
Lists all products for current user.

**Query Parameters:**
- `page` (int, default: 1)
- `limit` (int, default: 50, max: 200)
- `search` (string, optional): Full-text search
- `catalog_id` (string, optional): Filter by catalog

**Response:**
```json
{
  "products": [
    {
      "id": "prod_abc123",
      "name": "Eco-Friendly Notebook A5",
      "description": "100% recycled paper, 120 pages",
      "price": 12.99,
      "currency": "USD",
      "sku": "NB-A5-ECO",
      "category": "Stationery",
      "in_stock": true,
      "metadata": {
        "color": "Green",
        "size": "A5",
        "material": "Recycled paper"
      },
      "catalog_id": "catalog_xyz",
      "created_at": "2025-02-18T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total_products": 342,
    "total_pages": 7
  }
}
```

---

### `GET /api/products/{product_id}`
Fetches single product details.

**Response:**
```json
{
  "id": "prod_abc123",
  "name": "Eco-Friendly Notebook A5",
  "description": "100% recycled paper...",
  "price": 12.99,
  "chunks": [
    {
      "id": "chunk_001",
      "content": "This notebook features...",
      "chunk_index": 0
    }
  ],
  "metadata": {...},
  "embedding_status": "completed"
}
```

---

### `DELETE /api/products/{product_id}`
Deletes product and its embeddings.

**Response:**
```json
{
  "success": true,
  "deleted_product_id": "prod_abc123",
  "deleted_chunks": 3
}
```

---

## Clients API

### `POST /api/clients`
Adds a new client (for personalized responses).

**Request:**
```json
{
  "name": "Alice Johnson",
  "email": "alice@example.com",
  "telegram_id": "123456789",
  "phone": "+1234567890",
  "notes": "Prefers eco-friendly products. Budget-conscious.",
  "metadata": {
    "company": "GreenTech Inc",
    "role": "Procurement Manager"
  }
}
```

**Response:**
```json
{
  "id": "client_abc123",
  "name": "Alice Johnson",
  "email": "alice@example.com",
  "telegram_id": "123456789",
  "created_at": "2025-02-18T10:00:00Z"
}
```

---

### `GET /api/clients`
Lists all clients.

**Query Parameters:**
- `page`, `limit`, `search` (same as products API)

**Response:**
```json
{
  "clients": [
    {
      "id": "client_abc123",
      "name": "Alice Johnson",
      "email": "alice@example.com",
      "telegram_id": "123456789",
      "last_contact": "2025-02-18T09:30:00Z",
      "total_conversations": 12
    }
  ],
  "pagination": {...}
}
```

---

### `PATCH /api/clients/{client_id}`
Updates client information.

**Request:**
```json
{
  "notes": "Updated notes: prefers bulk orders",
  "metadata": {
    "company": "GreenTech Inc",
    "role": "VP of Operations"
  }
}
```

**Response:**
```json
{
  "success": true,
  "client_id": "client_abc123",
  "updated_at": "2025-02-18T11:00:00Z"
}
```

---

## Chat API (Internal)

### `POST /api/chat/query`
Processes a query with RAG + persona LLM (used internally by channel handlers).

**Request:**
```json
{
  "persona_id": "persona_def456",
  "client_id": "client_abc123",
  "query": "Do you have waterproof notebooks?",
  "include_audio": true,
  "conversation_id": "conv_xyz789"
}
```

**Response:**
```json
{
  "query_id": "query_abc123",
  "response": {
    "text": "Great question! Yes, we have the AquaGuard Notebook series. It features water-resistant pages and a durable plastic cover. Perfect for field work or outdoor use. The A5 size is $19.99 and includes 150 pages. We also offer a B5 size for $24.99. Would you like more details on the paper quality?",
    "audio_url": "https://storage.echome.com/responses/query_abc123.ogg",
    "audio_duration_seconds": 18,
    "rag_context": [
      {
        "product_id": "prod_waterproof_nb",
        "chunk": "AquaGuard Notebook - Water-resistant synthetic paper...",
        "similarity_score": 0.89
      }
    ],
    "tokens_used": {
      "prompt": 1240,
      "completion": 95,
      "total": 1335
    }
  },
  "processing_time_ms": 4230,
  "created_at": "2025-02-18T10:00:00Z"
}
```

**Errors:**
- `404 Not Found`: Persona or client not found
- `422 Unprocessable Entity`: Voice not cloned yet
- `500 Internal Server Error`: LLM or TTS API failure

---

## Settings API

### `GET /api/settings/api-keys`
Lists configured API keys (values redacted).

**Response:**
```json
{
  "api_keys": [
    {
      "id": "key_elevenlabs",
      "service": "elevenlabs",
      "name": "ElevenLabs API Key",
      "configured": true,
      "last_4_chars": "xY9z",
      "created_at": "2025-02-18T10:00:00Z"
    },
    {
      "id": "key_openai",
      "service": "openai",
      "name": "OpenAI API Key",
      "configured": true,
      "last_4_chars": "kL3m",
      "created_at": "2025-02-18T10:00:00Z"
    },
    {
      "id": "key_telegram",
      "service": "telegram",
      "name": "Telegram Bot Token",
      "configured": false
    }
  ]
}
```

---

### `POST /api/settings/api-keys`
Adds or updates an API key.

**Request:**
```json
{
  "service": "elevenlabs",
  "api_key": "sk_abc123def456..."
}
```

**Response:**
```json
{
  "success": true,
  "key_id": "key_elevenlabs",
  "service": "elevenlabs",
  "message": "API key updated successfully"
}
```

**Errors:**
- `400 Bad Request`: Invalid service name
- `401 Unauthorized`: Invalid API key (validated by calling service)

---

### `DELETE /api/settings/api-keys/{key_id}`
Removes an API key.

**Response:**
```json
{
  "success": true,
  "message": "API key deleted"
}
```

---

## Webhook API (Telegram)

### `POST /webhook/telegram`
Receives messages from Telegram Bot API.

**Headers:**
```
X-Telegram-Bot-Api-Secret-Token: {secret_token}
```

**Request (Telegram Update Object):**
```json
{
  "update_id": 123456789,
  "message": {
    "message_id": 456,
    "from": {
      "id": 123456789,
      "is_bot": false,
      "first_name": "Alice",
      "username": "alice_johnson"
    },
    "chat": {
      "id": 123456789,
      "type": "private"
    },
    "date": 1708257600,
    "text": "Do you have eco-friendly pens?"
  }
}
```

**Response (200 OK):**
```json
{
  "ok": true,
  "message": "Message processed"
}
```

**Processing Flow:**
1. Verify secret token
2. Look up client by `telegram_id`
3. Extract query text
4. Call `/api/chat/query` internally
5. Send audio reply via Telegram Bot API (`sendVoice`)
6. Log conversation in DB

**Telegram Commands:**
- `/start` - Welcome message + instructions
- `/help` - Usage help
- `/reset` - Clear conversation context

---

## Job Queue API (Internal)

### `GET /api/jobs/{job_id}`
Fetches job status (generic endpoint for all job types).

**Response:**
```json
{
  "job_id": "job_abc123",
  "type": "voice_clone",
  "status": "processing",
  "progress": 60,
  "created_at": "2025-02-18T10:00:00Z",
  "updated_at": "2025-02-18T10:02:00Z",
  "metadata": {
    "youtube_url": "https://youtube.com/...",
    "persona_id": "persona_def456"
  }
}
```

---

### `POST /api/jobs/{job_id}/cancel`
Cancels a running job.

**Response:**
```json
{
  "success": true,
  "job_id": "job_abc123",
  "status": "cancelled",
  "cancelled_at": "2025-02-18T10:03:00Z"
}
```

---

## Error Codes & Handling

### Standard HTTP Status Codes

| Code | Meaning | Usage |
|------|---------|-------|
| 200 | OK | Success (immediate result) |
| 202 | Accepted | Async job started |
| 400 | Bad Request | Invalid input (validation error) |
| 401 | Unauthorized | Missing or invalid session |
| 402 | Payment Required | API quota exceeded |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | State conflict (e.g., delete active persona) |
| 413 | Payload Too Large | File size exceeds limit |
| 422 | Unprocessable Entity | Semantic error (e.g., invalid YouTube URL) |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unexpected server error |
| 502 | Bad Gateway | External API failure (ElevenLabs, OpenAI) |
| 503 | Service Unavailable | Service temporarily down |

### Error Response Format

All errors return JSON:

```json
{
  "error": "error_code",
  "message": "Human-readable error message",
  "details": {
    "field": "Additional context",
    "suggestion": "How to fix"
  },
  "request_id": "req_abc123",
  "timestamp": "2025-02-18T10:00:00Z"
}
```

### Common Error Codes

| Code | Description | Retry? |
|------|-------------|--------|
| `invalid_input` | Validation failed | No (fix input) |
| `resource_not_found` | Entity doesn't exist | No |
| `unauthorized` | No valid session | No (re-authenticate) |
| `quota_exceeded` | API limit hit | Yes (after reset) |
| `external_api_error` | Third-party API failed | Yes (exponential backoff) |
| `job_failed` | Async job error | Check job details |
| `rate_limit` | Too many requests | Yes (after delay) |

### Rate Limiting

- **Per user:** 100 requests/minute
- **Per IP:** 1000 requests/minute
- **Headers:**
  - `X-RateLimit-Limit`: Max requests
  - `X-RateLimit-Remaining`: Requests left
  - `X-RateLimit-Reset`: Unix timestamp of reset

**Example:**
```
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1708257660

{
  "error": "rate_limit",
  "message": "Too many requests. Try again in 60 seconds.",
  "retry_after_seconds": 60
}
```

---

## Webhooks (Outbound)

### User-Defined Webhook (Future Feature)

Users can configure a webhook URL to receive notifications:

**Events:**
- `voice.cloned` - Voice cloning completed
- `persona.analyzed` - Persona extraction completed
- `products.ingested` - Product catalog ingested
- `conversation.started` - New customer conversation
- `conversation.ended` - Conversation ended

**Payload Example:**
```json
{
  "event": "voice.cloned",
  "timestamp": "2025-02-18T10:00:00Z",
  "user_id": "usr_abc123",
  "data": {
    "persona_id": "persona_def456",
    "voice_id": "21m00Tcm4TlvDq8ikWAM",
    "job_id": "job_voice_abc123"
  }
}
```

---

## API Client Examples

### cURL

```bash
# Clone voice
curl -X POST https://echome.example.com/api/voice/clone \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=abc123..." \
  -d '{
    "youtube_url": "https://youtube.com/watch?v=abc",
    "persona_name": "John Sales"
  }'

# Poll job status
curl https://echome.example.com/api/voice/status/job_abc123 \
  -H "Cookie: next-auth.session-token=abc123..."

# Upload products
curl -X POST https://echome.example.com/api/products/upload \
  -H "Cookie: next-auth.session-token=abc123..." \
  -F "file=@products.csv" \
  -F "catalog_name=Spring 2025"
```

### JavaScript (Fetch)

```javascript
// Clone voice
const response = await fetch('/api/voice/clone', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    youtube_url: 'https://youtube.com/watch?v=abc',
    persona_name: 'John Sales'
  })
});
const { job_id } = await response.json();

// Poll until complete
const pollStatus = async () => {
  const status = await fetch(`/api/voice/status/${job_id}`).then(r => r.json());
  if (status.status === 'completed') {
    console.log('Voice cloned!', status.result.voice_id);
  } else if (status.status === 'failed') {
    console.error('Failed:', status.error);
  } else {
    setTimeout(pollStatus, 3000); // Poll every 3s
  }
};
pollStatus();
```

### Python (Requests)

```python
import requests

# Clone voice
response = requests.post(
    'https://echome.example.com/api/voice/clone',
    json={
        'youtube_url': 'https://youtube.com/watch?v=abc',
        'persona_name': 'John Sales'
    },
    cookies={'next-auth.session-token': 'abc123...'}
)
job_id = response.json()['job_id']

# Poll status
import time
while True:
    status = requests.get(
        f'https://echome.example.com/api/voice/status/{job_id}',
        cookies={'next-auth.session-token': 'abc123...'}
    ).json()
    
    if status['status'] == 'completed':
        print(f"Voice ID: {status['result']['voice_id']}")
        break
    elif status['status'] == 'failed':
        print(f"Error: {status['error']}")
        break
    
    time.sleep(3)
```

---

## API Versioning

- **Current version:** v1 (implicit, no version in URL)
- **Future versions:** `/api/v2/...` (when breaking changes are introduced)
- **Deprecation policy:** 6 months notice before v1 shutdown

---

**Last updated:** 2025-02-18  
**Version:** 1.0 (MVP)
