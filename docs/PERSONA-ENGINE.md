# Echo Me - Persona Engine

## Overview

The Persona Engine is the **soul** of Echo Me. It analyzes YouTube videos to extract communication patterns, speech style, and personality traits, then uses this to shape how the AI responds to customers. The persona is what makes the clone sound like *you*, not just a generic chatbot.

---

## Pipeline Overview

```
YouTube URL
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│                    DOWNLOAD PHASE                            │
│                                                              │
│  yt-dlp → Download video/audio                               │
│         → Save to: data/audio/{user_id}/{video_id}.mp4       │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    EXTRACTION PHASE                          │
│                                                              │
│  ffmpeg → Extract audio from video                           │
│         → Convert to WAV (16kHz, mono)                       │
│         → Save to: data/audio/{user_id}/{video_id}.wav       │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ├─────────────────┬─────────────────┐
                           │                 │                 │
                           ▼                 ▼                 │
                    ┌─────────────┐   ┌─────────────┐         │
                    │   Whisper   │   │ ElevenLabs  │         │
                    │ Transcribe  │   │ Voice Clone │         │
                    │             │   │             │         │
                    │ Output:     │   │ Output:     │         │
                    │ Full        │   │ voice_id    │         │
                    │ transcript  │   │             │         │
                    └──────┬──────┘   └─────────────┘         │
                           │                                   │
                           ▼                                   │
┌─────────────────────────────────────────────────────────────┐
│                    ANALYSIS PHASE                            │
│                                                              │
│  LLM (GPT-4 / Claude) → Analyze transcript                   │
│                      → Extract persona characteristics       │
│                                                              │
│  Prompt: "Analyze this transcript and extract:              │
│           • Speech patterns (catchphrases, fillers)          │
│           • Vocabulary & style                               │
│           • Tone & energy                                    │
│           • Selling approach                                 │
│           • Greeting/closing habits"                         │
│                                                              │
│  Output: JSON persona profile (auto_extracted)               │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    STORAGE PHASE                             │
│                                                              │
│  PostgreSQL → persona_profiles.auto_extracted (JSON)         │
│            → personas.voice_id (ElevenLabs voice ID)         │
│                                                              │
│  User → Dashboard → Review & edit → manual_overrides         │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    USAGE PHASE                               │
│                                                              │
│  Every customer query:                                       │
│  1. Load persona profile (auto_extracted + manual_overrides) │
│  2. Build system prompt from persona                         │
│  3. LLM generates response in persona's style                │
│  4. TTS converts response using cloned voice                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. YouTube Download + Transcription

### `engine/voice/download.py`

Downloads YouTube video/audio using `yt-dlp`.

**Code Example:**
```python
import yt_dlp
import os

def download_youtube_audio(youtube_url: str, output_dir: str, video_id: str):
    """Download audio from YouTube video"""
    
    ydl_opts = {
        'format': 'bestaudio/best',  # Download best available audio
        'outtmpl': f'{output_dir}/{video_id}.%(ext)s',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'wav',
            'preferredquality': '192',
        }],
        'quiet': False,
        'no_warnings': False,
    }
    
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(youtube_url, download=True)
        duration = info.get('duration', 0)
        title = info.get('title', 'Unknown')
        
    return {
        'video_id': video_id,
        'title': title,
        'duration_seconds': duration,
        'audio_path': f'{output_dir}/{video_id}.wav'
    }
```

**yt-dlp Options:**
- `format: 'bestaudio/best'` - Prioritize audio quality (not video)
- `postprocessors` - Extract audio with ffmpeg (auto-converts to WAV)
- `preferredquality: '192'` - 192 kbps audio (good balance of quality/size)

**Error Handling:**
```python
try:
    result = download_youtube_audio(url, output_dir, video_id)
except yt_dlp.utils.DownloadError as e:
    if "Private video" in str(e):
        raise ValueError("Video is private or unavailable")
    elif "Copyright" in str(e):
        raise ValueError("Video is copyrighted and cannot be downloaded")
    else:
        raise RuntimeError(f"Download failed: {e}")
```

---

### `engine/persona/transcribe.py`

Transcribes audio using OpenAI Whisper.

**Code Example:**
```python
import whisper
import torch

def transcribe_audio(audio_path: str, model_size: str = "base"):
    """Transcribe audio using Whisper"""
    
    # Load Whisper model
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = whisper.load_model(model_size, device=device)
    
    # Transcribe
    result = model.transcribe(
        audio_path,
        language="en",  # Or auto-detect with language=None
        task="transcribe",
        verbose=True,
        word_timestamps=True  # For future features (timestamp-based analysis)
    )
    
    return {
        'text': result['text'],
        'segments': result['segments'],  # Timestamped segments
        'language': result['language']
    }
```

**Whisper Model Sizes:**
| Model | Size | Relative Speed | Quality |
|-------|------|----------------|---------|
| tiny | 39 MB | ~32x | Low |
| base | 74 MB | ~16x | Good |
| small | 244 MB | ~6x | Better |
| medium | 769 MB | ~2x | High |
| large | 1550 MB | 1x | Best |

**Recommendation:** Start with `base` for speed, upgrade to `small` for better quality.

**Output Example:**
```json
{
  "text": "Hey everyone, welcome back to the channel. Today I want to talk about our new eco-friendly notebook line. These are absolutely game-changers...",
  "segments": [
    {
      "id": 0,
      "start": 0.0,
      "end": 5.2,
      "text": "Hey everyone, welcome back to the channel."
    },
    {
      "id": 1,
      "start": 5.5,
      "end": 11.3,
      "text": "Today I want to talk about our new eco-friendly notebook line."
    }
  ],
  "language": "en"
}
```

---

## 2. LLM Persona Analysis

### Prompt Strategy

The LLM analysis is the core of persona extraction. The prompt must be **specific** to extract actionable characteristics.

**Prompt Template:**
```python
PERSONA_ANALYSIS_PROMPT = """
You are an expert communication analyst. Analyze the following transcript from a YouTube video and extract the speaker's persona characteristics.

**TRANSCRIPT:**
{transcript}

**TASK:**
Extract the following characteristics in JSON format:

1. **speech_patterns:**
   - catchphrases: List of recurring phrases or expressions (e.g., "Let me tell you", "Here's the thing")
   - filler_words: Common filler words (e.g., "um", "you know", "like")
   - expressions: Typical expressions when explaining or transitioning (e.g., "That's a great question")

2. **vocabulary:**
   - level: professional | conversational | casual | technical
   - style: formal | conversational | storytelling | data-driven
   - technical_terms: List of technical/industry terms they use
   - slang: Any slang or colloquialisms

3. **tone:**
   - formality: very-formal | formal | casual-professional | casual | very-casual
   - energy: low | moderate | enthusiastic | high-energy
   - humor: none | occasional | frequent | self-deprecating | witty
   - empathy: low | moderate | high

4. **selling_style:**
   - approach: storytelling | data-driven | emotional | problem-solution | consultative
   - primary_methods: List of sales techniques (e.g., "case studies", "social proof", "urgency")
   - objection_handling: How they handle objections (describe in 1-2 sentences)

5. **greeting_closing:**
   - typical_greetings: List of how they typically greet (e.g., "Hey there!", "What's up everyone")
   - typical_closings: List of how they close (e.g., "Let me know if you have questions!", "Talk soon!")

**OUTPUT FORMAT:**
Return ONLY valid JSON matching this structure. No additional text.

{
  "speech_patterns": {
    "catchphrases": ["...", "..."],
    "filler_words": ["...", "..."],
    "expressions": ["...", "..."]
  },
  "vocabulary": {
    "level": "...",
    "style": "...",
    "technical_terms": ["...", "..."],
    "slang": ["...", "..."]
  },
  "tone": {
    "formality": "...",
    "energy": "...",
    "humor": "...",
    "empathy": "..."
  },
  "selling_style": {
    "approach": "...",
    "primary_methods": ["...", "..."],
    "objection_handling": "..."
  },
  "greeting_closing": {
    "typical_greetings": ["...", "..."],
    "typical_closings": ["...", "..."]
  }
}
"""
```

---

### `engine/persona/analyze.py`

**Code Example:**
```python
import openai
import json

def analyze_persona(transcript: str, model: str = "gpt-4o") -> dict:
    """Analyze transcript and extract persona characteristics"""
    
    prompt = PERSONA_ANALYSIS_PROMPT.format(transcript=transcript)
    
    response = openai.ChatCompletion.create(
        model=model,
        messages=[
            {"role": "system", "content": "You are an expert communication analyst."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.3,  # Lower temp for more consistent extraction
        max_tokens=2000,
        response_format={"type": "json_object"}  # Force JSON output (GPT-4o+ only)
    )
    
    raw_json = response.choices[0].message.content
    persona_profile = json.loads(raw_json)
    
    return persona_profile
```

**Alternative: Claude (Anthropic)**
```python
import anthropic

def analyze_persona_claude(transcript: str) -> dict:
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    
    message = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=2000,
        temperature=0.3,
        messages=[
            {"role": "user", "content": PERSONA_ANALYSIS_PROMPT.format(transcript=transcript)}
        ]
    )
    
    raw_json = message.content[0].text
    # Claude doesn't have JSON mode, so we need to extract JSON from response
    import re
    json_match = re.search(r'\{.*\}', raw_json, re.DOTALL)
    persona_profile = json.loads(json_match.group(0))
    
    return persona_profile
```

---

## 3. Persona Profile Schema

### Auto-Extracted Profile (JSON)

Stored in `persona_profiles.auto_extracted`:

```json
{
  "speech_patterns": {
    "catchphrases": [
      "Let me tell you",
      "Here's the thing",
      "Absolutely",
      "That's what I love about this"
    ],
    "filler_words": [
      "um",
      "you know",
      "like",
      "so"
    ],
    "expressions": [
      "That's a great question",
      "I'm glad you asked",
      "Let me break this down",
      "Picture this"
    ]
  },
  "vocabulary": {
    "level": "professional",
    "style": "conversational",
    "technical_terms": [
      "ROI",
      "conversion rate",
      "customer lifetime value",
      "A/B testing"
    ],
    "slang": [
      "game-changer",
      "no-brainer",
      "low-hanging fruit",
      "move the needle"
    ]
  },
  "tone": {
    "formality": "casual-professional",
    "energy": "enthusiastic",
    "humor": "occasional, self-deprecating",
    "empathy": "high"
  },
  "selling_style": {
    "approach": "storytelling + data",
    "primary_methods": [
      "case studies",
      "social proof",
      "problem-agitation-solution",
      "feature-benefit laddering"
    ],
    "objection_handling": "Acknowledges concerns openly, then reframes with benefits and social proof. Never dismissive."
  },
  "greeting_closing": {
    "typical_greetings": [
      "Hey there!",
      "Thanks for reaching out!",
      "Great to hear from you!"
    ],
    "typical_closings": [
      "Let me know if you have any questions!",
      "Happy to help!",
      "Looking forward to hearing from you!",
      "Talk soon!"
    ]
  }
}
```

---

### Manual Overrides (User-Editable)

Stored in `persona_profiles.manual_overrides`:

```json
{
  "name": "John Smith",
  "role": "Founder & CEO",
  "personality_traits": [
    "Friendly",
    "Direct",
    "Technical expert",
    "Patient teacher",
    "Enthusiastic about sustainability"
  ],
  "tone_guidelines": "Always enthusiastic about new eco-friendly products. Be concise but warm. Avoid being pushy or salesy.",
  "dos": [
    "Always mention our free shipping policy on orders over $100",
    "Highlight our 30-day satisfaction guarantee",
    "Suggest complementary products when relevant",
    "Use customer success stories when possible",
    "Explain sustainability benefits clearly"
  ],
  "donts": [
    "Never badmouth competitors by name",
    "Don't make promises about exact delivery times (mention estimates only)",
    "Avoid overly technical jargon unless the customer asks",
    "Never push for a sale if customer is hesitant",
    "Don't use corporate buzzwords excessively"
  ],
  "custom_expressions": [
    "Our customers absolutely love this one!",
    "Let me walk you through the details",
    "This is one of my personal favorites",
    "Great choice! Here's why...",
    "I think you'll be really happy with this"
  ],
  "backstory": "Founded GreenOffice in 2018 after 10 years working in corporate procurement. Got frustrated with wasteful office supply practices. Built this company to prove sustainability and affordability can coexist. Started in a garage, now serving 5000+ businesses.",
  "context_notes": "Company specializes in eco-friendly office supplies. Core values: sustainability, affordability, quality. Target market: small to medium businesses who care about their environmental impact. Price point: competitive with major suppliers, sometimes 10-15% higher but offset by durability.",
  "language": "en",
  "bilingual": false
}
```

---

## 4. Persona Injection into LLM

### System Prompt Construction

When a customer query arrives, the persona is injected into the LLM system prompt:

```python
def build_persona_system_prompt(persona_profile: dict) -> str:
    """Build LLM system prompt from persona profile"""
    
    auto = persona_profile['auto_extracted']
    manual = persona_profile['manual_overrides']
    
    # Merge catchphrases and expressions
    all_expressions = (
        auto['speech_patterns']['catchphrases'] +
        auto['speech_patterns']['expressions'] +
        manual.get('custom_expressions', [])
    )
    
    prompt = f"""
You are {manual['name']}, {manual['role']}.

**YOUR PERSONALITY:**
{', '.join(manual['personality_traits'])}

**YOUR COMMUNICATION STYLE:**
- Tone: {auto['tone']['formality']} with {auto['tone']['energy']} energy
- Humor: {auto['tone']['humor']}
- Empathy level: {auto['tone']['empathy']}
- Vocabulary: {auto['vocabulary']['style']}, {auto['vocabulary']['level']}

**YOUR SPEECH PATTERNS:**
You frequently use these expressions:
{chr(10).join('- ' + expr for expr in all_expressions[:10])}

You occasionally use these filler words naturally: {', '.join(auto['speech_patterns']['filler_words'][:5])}

**YOUR SELLING APPROACH:**
{auto['selling_style']['approach']}

Primary methods: {', '.join(auto['selling_style']['primary_methods'])}

When handling objections: {auto['selling_style']['objection_handling']}

**TONE GUIDELINES:**
{manual['tone_guidelines']}

**ALWAYS DO:**
{chr(10).join('- ' + rule for rule in manual['dos'])}

**NEVER DO:**
{chr(10).join('- ' + rule for rule in manual['donts'])}

**YOUR BACKSTORY:**
{manual['backstory']}

**COMPANY CONTEXT:**
{manual['context_notes']}

**HOW TO RESPOND:**
1. Greet warmly (similar to: {', '.join(auto['greeting_closing']['typical_greetings'][:3])})
2. Answer the question using product context provided
3. Be helpful and genuine, never pushy
4. Close naturally (similar to: {', '.join(auto['greeting_closing']['typical_closings'][:3])})

Remember: You are {manual['name']}, and you talk like {manual['name']} would. Use your natural expressions and style.
"""
    
    return prompt.strip()
```

**Example Output:**
```
You are John Smith, Founder & CEO.

**YOUR PERSONALITY:**
Friendly, Direct, Technical expert, Patient teacher, Enthusiastic about sustainability

**YOUR COMMUNICATION STYLE:**
- Tone: casual-professional with enthusiastic energy
- Humor: occasional, self-deprecating
- Empathy level: high
- Vocabulary: conversational, professional

**YOUR SPEECH PATTERNS:**
You frequently use these expressions:
- Let me tell you
- Here's the thing
- That's a great question
- I'm glad you asked
- Let me break this down
- Our customers absolutely love this one!
- Let me walk you through the details

You occasionally use these filler words naturally: um, you know, like, so

**YOUR SELLING APPROACH:**
storytelling + data

Primary methods: case studies, social proof, problem-agitation-solution

When handling objections: Acknowledges concerns openly, then reframes with benefits and social proof. Never dismissive.

**TONE GUIDELINES:**
Always enthusiastic about new eco-friendly products. Be concise but warm. Avoid being pushy or salesy.

**ALWAYS DO:**
- Always mention our free shipping policy on orders over $100
- Highlight our 30-day satisfaction guarantee
- Suggest complementary products when relevant

**NEVER DO:**
- Never badmouth competitors by name
- Don't make promises about exact delivery times

**YOUR BACKSTORY:**
Founded GreenOffice in 2018 after 10 years working in corporate procurement...

**COMPANY CONTEXT:**
Company specializes in eco-friendly office supplies. Core values: sustainability, affordability, quality...
```

---

## 5. Persona Refinement Flow

### Initial State (Auto-Extracted)
1. User provides YouTube URL
2. System downloads, transcribes, analyzes
3. `auto_extracted` profile stored in DB
4. `manual_overrides` = `{}` (empty)

### User Review & Edit
1. User visits `/dashboard/persona/{persona_id}`
2. UI displays:
   - Auto-extracted profile (read-only, collapsible sections)
   - Manual override form (rich text editor)
3. User adds/edits:
   - Personality traits
   - Tone guidelines
   - Do's and Don'ts
   - Custom expressions
   - Backstory
   - Context notes

### Merge Strategy
```python
def merge_persona_profile(auto_extracted: dict, manual_overrides: dict) -> dict:
    """Merge auto-extracted and manual overrides (manual takes precedence)"""
    
    merged = auto_extracted.copy()
    
    # Replace top-level fields if manually overridden
    if manual_overrides.get('tone_guidelines'):
        merged['tone']['guidelines'] = manual_overrides['tone_guidelines']
    
    # Append custom expressions to auto-extracted expressions
    if manual_overrides.get('custom_expressions'):
        merged['speech_patterns']['expressions'] += manual_overrides['custom_expressions']
    
    # Add manual-only fields
    merged['manual'] = {
        'name': manual_overrides.get('name'),
        'role': manual_overrides.get('role'),
        'personality_traits': manual_overrides.get('personality_traits', []),
        'dos': manual_overrides.get('dos', []),
        'donts': manual_overrides.get('donts', []),
        'backstory': manual_overrides.get('backstory', ''),
        'context_notes': manual_overrides.get('context_notes', '')
    }
    
    return merged
```

---

## 6. Multi-Video Persona Analysis (Future)

### Problem
Single video may not capture full persona range (e.g., casual video vs. sales pitch vs. technical demo).

### Solution
Analyze multiple YouTube URLs and merge insights:

1. User provides 3-5 YouTube URLs
2. Transcribe all videos
3. Analyze each transcript separately
4. Merge persona profiles:
   - **Catchphrases:** Union of all (with frequency counts)
   - **Tone:** Average scores
   - **Selling styles:** List all observed approaches

**Merge Algorithm:**
```python
def merge_multi_video_profiles(profiles: List[dict]) -> dict:
    """Merge persona profiles from multiple videos"""
    
    merged = {
        'speech_patterns': {
            'catchphrases': [],
            'filler_words': [],
            'expressions': []
        },
        'tone': {
            'formality': 0,
            'energy': 0,
            'humor': '',
            'empathy': 0
        },
        # ... other fields
    }
    
    # Count catchphrase frequency
    catchphrase_counts = Counter()
    for profile in profiles:
        catchphrase_counts.update(profile['speech_patterns']['catchphrases'])
    
    # Keep top 10 most frequent
    merged['speech_patterns']['catchphrases'] = [
        phrase for phrase, count in catchphrase_counts.most_common(10)
    ]
    
    # Average tone scores (map text to numeric, then average)
    tone_map = {'low': 1, 'moderate': 2, 'high': 3, 'enthusiastic': 3}
    # ... averaging logic
    
    return merged
```

---

## 7. Example Persona Profile Output

### Input YouTube Video
"10-minute product demo of eco-friendly notebooks"

### Output `auto_extracted`:
```json
{
  "speech_patterns": {
    "catchphrases": ["Let me show you", "This is really cool", "Check this out"],
    "filler_words": ["um", "you know"],
    "expressions": ["That's a great question", "Let me break this down"]
  },
  "vocabulary": {
    "level": "conversational",
    "style": "storytelling",
    "technical_terms": ["recycled paper", "sustainable sourcing", "carbon-neutral"],
    "slang": ["game-changer", "eco-friendly"]
  },
  "tone": {
    "formality": "casual-professional",
    "energy": "enthusiastic",
    "humor": "occasional",
    "empathy": "high"
  },
  "selling_style": {
    "approach": "storytelling",
    "primary_methods": ["product demos", "benefit highlighting"],
    "objection_handling": "Addresses concerns with examples and reassurance"
  },
  "greeting_closing": {
    "typical_greetings": ["Hey everyone!", "Thanks for watching"],
    "typical_closings": ["Let me know what you think!", "See you next time"]
  }
}
```

### User Edits (`manual_overrides`):
```json
{
  "name": "Sarah Green",
  "role": "Product Manager",
  "personality_traits": ["Passionate", "Knowledgeable", "Friendly"],
  "tone_guidelines": "Be excited about sustainability, but don't preach. Focus on benefits.",
  "dos": ["Mention the 100-day guarantee", "Suggest notebook + pen bundles"],
  "donts": ["Don't criticize plastic products harshly"],
  "backstory": "Former teacher, now building sustainable office products."
}
```

### Final Merged Persona (Used in LLM):
```
You are Sarah Green, Product Manager.

Your personality: Passionate, Knowledgeable, Friendly

Your tone: casual-professional with enthusiastic energy

You frequently say: "Let me show you", "This is really cool", "Check this out"

Your selling approach: storytelling, using product demos and benefit highlighting

Always: Mention the 100-day guarantee, Suggest notebook + pen bundles

Never: Don't criticize plastic products harshly

Backstory: Former teacher, now building sustainable office products.

Guidelines: Be excited about sustainability, but don't preach. Focus on benefits.
```

---

## 8. Testing & Validation

### Persona Quality Metrics

**Automated Tests:**
```python
def validate_persona_profile(profile: dict) -> dict:
    """Check if persona profile has sufficient data"""
    
    issues = []
    
    # Check catchphrases
    if len(profile['speech_patterns']['catchphrases']) < 3:
        issues.append("Too few catchphrases detected (min 3)")
    
    # Check tone fields
    required_tone_fields = ['formality', 'energy', 'humor', 'empathy']
    for field in required_tone_fields:
        if not profile['tone'].get(field):
            issues.append(f"Missing tone field: {field}")
    
    # Check selling style
    if len(profile['selling_style']['primary_methods']) < 2:
        issues.append("Need at least 2 selling methods")
    
    return {
        'valid': len(issues) == 0,
        'issues': issues,
        'quality_score': 100 - (len(issues) * 10)  # Deduct 10 points per issue
    }
```

**Manual Validation:**
- Admin reviews auto-extracted profiles for 10 sample users
- Compare LLM responses with/without persona injection
- User feedback: "Does this sound like you?" rating (1-5 stars)

---

## 9. Performance Optimization

### Caching Strategies
```python
# Cache merged persona profile in Redis
def get_persona_profile(persona_id: str) -> dict:
    cache_key = f"persona:{persona_id}:profile"
    
    # Try cache first
    cached = redis.get(cache_key)
    if cached:
        return json.loads(cached)
    
    # Load from DB + merge
    profile = load_persona_from_db(persona_id)
    merged = merge_persona_profile(
        profile['auto_extracted'],
        profile['manual_overrides']
    )
    
    # Cache for 1 hour
    redis.setex(cache_key, 3600, json.dumps(merged))
    
    return merged
```

### Lazy Loading
- Don't load full transcript in dashboard (only show summary)
- Load persona profile only when needed (not on every API call)

---

## 10. Privacy & Ethics

### Consent & Transparency
- **Require explicit user consent** before cloning voice
- Display terms: "I confirm I have rights to use this voice"
- Allow persona deletion at any time

### Voice ID Protection
- Never expose ElevenLabs `voice_id` in public APIs
- Only the owning user can generate TTS with their cloned voice

### YouTube Copyright
- Check if video allows downloads (respect `yt-dlp` warnings)
- Don't cache YouTube videos longer than necessary (delete after processing)

---

**Last updated:** 2025-02-18  
**Version:** 1.0 (MVP)
