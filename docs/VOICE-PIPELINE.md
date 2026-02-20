# Echo Me - Voice Cloning Pipeline

## Overview

The Voice Pipeline clones a person's voice from YouTube audio using ElevenLabs Voice Cloning API. The cloned voice is then used for Text-to-Speech (TTS) generation when responding to customer queries.

---

## Pipeline Flow

```
YouTube URL
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│  STEP 1: Download                                             │
│                                                               │
│  yt-dlp --format bestaudio {youtube_url}                      │
│         --output data/audio/{user_id}/{video_id}.%(ext)s      │
│                                                               │
│  Downloads: MP4/WEBM/M4A (best available audio format)        │
└────────────────────────┬──────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│  STEP 2: Extract & Clean Audio                                │
│                                                               │
│  ffmpeg -i input.mp4                                          │
│         -vn                    (no video)                     │
│         -ar 44100              (sample rate: 44.1kHz)         │
│         -ac 1                  (mono channel)                 │
│         -b:a 192k              (bitrate: 192 kbps)            │
│         -af "highpass=f=80,    (remove low-freq noise)        │
│              lowpass=f=8000,   (remove high-freq noise)       │
│              afftdn=nf=-25"    (denoise)                      │
│         output.wav                                            │
│                                                               │
│  Output: Clean WAV file (44.1kHz, mono, 192kbps)              │
└────────────────────────┬──────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│  STEP 3: Sample Selection (for ElevenLabs)                    │
│                                                               │
│  - Detect speech segments (VAD - Voice Activity Detection)    │
│  - Extract 1-3 clear samples (30-60s each)                    │
│  - Avoid music, overlapping voices, loud background noise     │
│                                                               │
│  Output: sample_1.wav, sample_2.wav, sample_3.wav             │
└────────────────────────┬──────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│  STEP 4: Upload to ElevenLabs                                 │
│                                                               │
│  POST https://api.elevenlabs.io/v1/voices/add                 │
│  Headers: xi-api-key: {ELEVENLABS_API_KEY}                    │
│  Body (multipart/form-data):                                  │
│    - name: "John Smith Clone"                                 │
│    - files: [sample_1.wav, sample_2.wav]                      │
│    - description: "Cloned from YouTube"                       │
│                                                               │
│  Response: { "voice_id": "21m00Tcm4TlvDq8ikWAM" }             │
└────────────────────────┬──────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│  STEP 5: Store Voice ID                                       │
│                                                               │
│  UPDATE personas SET voice_id = '21m00Tcm...' WHERE id = ... │
│                                                               │
│  Status: active (ready for TTS)                               │
└──────────────────────────────────────────────────────────────┘
```

---

## 1. YouTube Audio Extraction

### `engine/voice/download.py`

**Full Implementation:**

```python
import yt_dlp
import os
from pathlib import Path

def download_youtube_audio(
    youtube_url: str,
    output_dir: str,
    video_id: str
) -> dict:
    """
    Download audio from YouTube video using yt-dlp.
    
    Args:
        youtube_url: YouTube video URL
        output_dir: Directory to save audio file
        video_id: Unique identifier for this video
        
    Returns:
        dict with video metadata and audio path
    """
    
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': f'{output_dir}/{video_id}.%(ext)s',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'wav',
            'preferredquality': '192',
        }],
        'quiet': False,
        'no_warnings': False,
        'extract_audio': True,
        'keepvideo': False,
        'noplaylist': True,  # Don't download entire playlist
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(youtube_url, download=True)
            
        return {
            'video_id': video_id,
            'title': info.get('title', 'Unknown'),
            'duration_seconds': info.get('duration', 0),
            'uploader': info.get('uploader', 'Unknown'),
            'upload_date': info.get('upload_date'),
            'audio_path': f'{output_dir}/{video_id}.wav',
            'original_url': youtube_url
        }
        
    except yt_dlp.utils.DownloadError as e:
        error_msg = str(e)
        
        if "Private video" in error_msg:
            raise ValueError("YouTube video is private or unavailable")
        elif "Copyright" in error_msg or "blocked" in error_msg:
            raise ValueError("Video cannot be downloaded due to copyright restrictions")
        elif "Video unavailable" in error_msg:
            raise ValueError("Video not found or has been removed")
        else:
            raise RuntimeError(f"YouTube download failed: {error_msg}")
```

**yt-dlp Format Selection:**
- `bestaudio`: Downloads highest quality audio stream
- `best`: Fallback if audio-only not available
- Post-processing extracts audio and converts to WAV

**Common Issues:**
| Error | Cause | Solution |
|-------|-------|----------|
| `Private video` | Video is private/unlisted | Use public video or authenticate |
| `Copyright` | DMCA takedown | Use different video |
| `Video unavailable` | Deleted or region-locked | Check URL, try VPN |
| `Slow download` | Large video (1hr+) | Consider shorter clips |

---

## 2. Audio Processing (ffmpeg)

### `engine/voice/extract.py`

**Full Implementation:**

```python
import subprocess
import os

def clean_audio_for_voice_cloning(
    input_path: str,
    output_path: str,
    sample_rate: int = 44100,
    channels: int = 1,
    bitrate: str = "192k"
) -> dict:
    """
    Clean and prepare audio for ElevenLabs voice cloning.
    
    Requirements:
    - Sample rate: 44.1kHz (ElevenLabs recommendation)
    - Channels: Mono (reduces file size, improves quality)
    - Format: WAV (lossless)
    - Noise reduction: Remove background noise
    
    Args:
        input_path: Path to raw audio file
        output_path: Path to save cleaned audio
        sample_rate: Target sample rate (default 44100 Hz)
        channels: Number of audio channels (1=mono, 2=stereo)
        bitrate: Audio bitrate
        
    Returns:
        dict with output file info
    """
    
    # FFmpeg command
    cmd = [
        'ffmpeg',
        '-i', input_path,
        '-vn',                          # No video
        '-ar', str(sample_rate),        # Sample rate
        '-ac', str(channels),           # Mono
        '-b:a', bitrate,                # Bitrate
        '-af', (
            'highpass=f=80,'            # Remove low-freq rumble (< 80 Hz)
            'lowpass=f=8000,'           # Remove high-freq hiss (> 8 kHz)
            'afftdn=nf=-25,'            # Noise reduction
            'loudnorm=I=-16:TP=-1.5'    # Normalize loudness
        ),
        '-y',                           # Overwrite output
        output_path
    ]
    
    try:
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
            text=True
        )
        
        # Get output file info
        file_size = os.path.getsize(output_path)
        duration = get_audio_duration(output_path)
        
        return {
            'output_path': output_path,
            'file_size_bytes': file_size,
            'duration_seconds': duration,
            'sample_rate': sample_rate,
            'channels': channels,
            'format': 'wav'
        }
        
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"FFmpeg processing failed: {e.stderr}")


def get_audio_duration(file_path: str) -> float:
    """Get audio file duration using ffprobe"""
    
    cmd = [
        'ffprobe',
        '-i', file_path,
        '-show_entries', 'format=duration',
        '-v', 'quiet',
        '-of', 'csv=p=0'
    ]
    
    result = subprocess.run(cmd, stdout=subprocess.PIPE, text=True)
    return float(result.stdout.strip())
```

**FFmpeg Filters Explained:**

| Filter | Purpose | Settings |
|--------|---------|----------|
| `highpass=f=80` | Remove low-frequency rumble (air conditioner, traffic) | 80 Hz cutoff |
| `lowpass=f=8000` | Remove high-frequency hiss (electronic noise) | 8 kHz cutoff |
| `afftdn=nf=-25` | FFT-based noise reduction | Noise floor -25 dB |
| `loudnorm` | Normalize audio loudness to consistent level | I=-16 (integrated loudness) |

**Audio Specs for ElevenLabs:**
- **Format:** WAV (PCM)
- **Sample Rate:** 44.1 kHz or 48 kHz
- **Bit Depth:** 16-bit or 24-bit
- **Channels:** Mono preferred (stereo also works)
- **Duration:** 30 seconds - 3 minutes (optimal for instant cloning)

---

## 3. Voice Sample Selection

### `engine/voice/sample.py`

**Voice Activity Detection (VAD):**

```python
import webrtcvad
import wave
import struct

def extract_speech_segments(
    audio_path: str,
    output_dir: str,
    segment_duration: int = 60,
    num_segments: int = 3
) -> list:
    """
    Extract clean speech segments from audio using VAD.
    
    Args:
        audio_path: Path to audio file
        output_dir: Directory to save segments
        segment_duration: Target duration per segment (seconds)
        num_segments: Number of segments to extract
        
    Returns:
        List of segment file paths
    """
    
    # Initialize VAD
    vad = webrtcvad.Vad(2)  # Aggressiveness: 0-3 (2 = moderate)
    
    # Read audio
    with wave.open(audio_path, 'rb') as wf:
        sample_rate = wf.getframerate()
        frames = wf.readframes(wf.getnframes())
        
    # Convert to 16-bit PCM
    pcm_data = struct.unpack(f"{len(frames)//2}h", frames)
    
    # Detect speech frames (30ms windows)
    frame_duration_ms = 30
    frame_size = int(sample_rate * frame_duration_ms / 1000)
    
    speech_segments = []
    current_segment = []
    
    for i in range(0, len(pcm_data), frame_size):
        frame = pcm_data[i:i+frame_size]
        
        if len(frame) < frame_size:
            break
            
        frame_bytes = struct.pack(f"{len(frame)}h", *frame)
        
        is_speech = vad.is_speech(frame_bytes, sample_rate)
        
        if is_speech:
            current_segment.extend(frame)
        else:
            if len(current_segment) > 0:
                speech_segments.append(current_segment)
                current_segment = []
    
    # Select best segments (longest, clearest)
    speech_segments = sorted(speech_segments, key=len, reverse=True)
    selected_segments = speech_segments[:num_segments]
    
    # Save segments
    segment_paths = []
    for idx, segment in enumerate(selected_segments):
        segment_path = f"{output_dir}/sample_{idx+1}.wav"
        
        with wave.open(segment_path, 'wb') as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)  # 16-bit
            wf.setframerate(sample_rate)
            wf.writeframes(struct.pack(f"{len(segment)}h", *segment))
        
        segment_paths.append(segment_path)
    
    return segment_paths
```

**Manual Alternative (if VAD too complex for MVP):**
```python
def split_audio_into_chunks(
    audio_path: str,
    output_dir: str,
    chunk_duration: int = 60,
    num_chunks: int = 3
) -> list:
    """
    Simple approach: Split audio into equal chunks.
    Works if entire video is person speaking (e.g., podcast, vlog).
    """
    
    duration = get_audio_duration(audio_path)
    chunk_paths = []
    
    for i in range(num_chunks):
        start_time = i * chunk_duration
        if start_time + chunk_duration > duration:
            break
            
        output_path = f"{output_dir}/sample_{i+1}.wav"
        
        cmd = [
            'ffmpeg',
            '-i', audio_path,
            '-ss', str(start_time),
            '-t', str(chunk_duration),
            '-vn',
            '-acodec', 'pcm_s16le',
            '-ar', '44100',
            '-ac', '1',
            '-y',
            output_path
        ]
        
        subprocess.run(cmd, check=True, capture_output=True)
        chunk_paths.append(output_path)
    
    return chunk_paths
```

---

## 4. ElevenLabs Voice Cloning API

### Instant Voice Cloning

**API Endpoint:** `POST https://api.elevenlabs.io/v1/voices/add`

**Python SDK Example:**
```python
from elevenlabs import VoiceSettings, Voice
from elevenlabs.client import ElevenLabs
import os

def clone_voice_elevenlabs(
    name: str,
    sample_paths: list,
    description: str = ""
) -> str:
    """
    Clone voice using ElevenLabs Instant Voice Cloning.
    
    Args:
        name: Name for the cloned voice
        sample_paths: List of audio sample file paths (1-25 files)
        description: Optional voice description
        
    Returns:
        voice_id: ElevenLabs voice ID
    """
    
    client = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])
    
    # Upload audio samples
    files = [open(path, 'rb') for path in sample_paths]
    
    try:
        voice = client.voices.add(
            name=name,
            files=files,
            description=description or f"Cloned voice for {name}"
        )
        
        voice_id = voice.voice_id
        
        print(f"✓ Voice cloned successfully: {voice_id}")
        
        return voice_id
        
    finally:
        # Close file handles
        for f in files:
            f.close()


def test_cloned_voice(voice_id: str, test_text: str = "Hello, this is a test of my cloned voice."):
    """Generate test audio to verify voice quality"""
    
    client = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])
    
    audio = client.text_to_speech.convert(
        voice_id=voice_id,
        text=test_text,
        model_id="eleven_multilingual_v2",
        voice_settings=VoiceSettings(
            stability=0.5,
            similarity_boost=0.75,
            style=0.0,
            use_speaker_boost=True
        )
    )
    
    # Save test audio
    output_path = f"test_voice_{voice_id}.mp3"
    with open(output_path, 'wb') as f:
        for chunk in audio:
            f.write(chunk)
    
    return output_path
```

**Request Parameters:**
- `name` (required): Display name for voice
- `files` (required): 1-25 audio samples (WAV/MP3, min 30s total)
- `description` (optional): Voice description
- `labels` (optional): Metadata tags (e.g., {"accent": "American", "age": "young"})

**Response:**
```json
{
  "voice_id": "21m00Tcm4TlvDq8ikWAM",
  "name": "John Smith Clone",
  "samples": [
    {
      "sample_id": "abc123",
      "file_name": "sample_1.wav",
      "mime_type": "audio/wav",
      "size_bytes": 524288
    }
  ],
  "category": "cloned",
  "description": "Cloned voice for John Smith",
  "created_at": "2025-02-18T10:00:00Z"
}
```

**Error Handling:**
```python
from elevenlabs import APIError

try:
    voice_id = clone_voice_elevenlabs(name, sample_paths)
except APIError as e:
    if e.status_code == 402:
        raise Exception("ElevenLabs quota exceeded. Upgrade plan or wait for reset.")
    elif e.status_code == 400:
        raise Exception(f"Invalid audio samples: {e.body}")
    else:
        raise Exception(f"ElevenLabs API error: {e}")
```

---

### Professional Voice Cloning (Optional)

**Higher quality, requires ElevenLabs review (1-2 business days):**

```python
def clone_voice_professional(
    name: str,
    sample_paths: list,
    description: str
) -> str:
    """
    Request professional voice cloning (higher quality).
    Requires manual review by ElevenLabs team.
    """
    
    client = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])
    
    # Professional cloning requires more samples (10-30 files recommended)
    if len(sample_paths) < 10:
        raise ValueError("Professional cloning requires at least 10 audio samples")
    
    files = [open(path, 'rb') for path in sample_paths]
    
    try:
        request = client.voices.add_professional(
            name=name,
            files=files,
            description=description
        )
        
        return {
            'request_id': request.request_id,
            'status': 'pending_review',
            'message': 'Professional voice cloning request submitted. Check status in 1-2 days.'
        }
        
    finally:
        for f in files:
            f.close()
```

**Comparison:**

| Feature | Instant Cloning | Professional Cloning |
|---------|-----------------|---------------------|
| **Quality** | Good | Excellent |
| **Speed** | Immediate | 1-2 business days |
| **Samples Required** | 1-3 files (30s-3min) | 10-30 files (10+ min total) |
| **Cost** | Included in plans | Higher tier plans only |
| **Use Case** | MVP, quick prototypes | Production, high-quality |

**Recommendation for MVP:** Use Instant Cloning (fast, good enough quality).

---

## 5. TTS Generation

### Generate Audio from Text

```python
def generate_tts(
    voice_id: str,
    text: str,
    output_path: str,
    model: str = "eleven_multilingual_v2",
    stability: float = 0.5,
    similarity_boost: float = 0.75
) -> dict:
    """
    Generate speech audio using cloned voice.
    
    Args:
        voice_id: ElevenLabs voice ID
        text: Text to convert to speech
        output_path: Where to save audio file
        model: TTS model (eleven_multilingual_v2, eleven_monolingual_v1)
        stability: Voice consistency (0-1, lower = more expressive)
        similarity_boost: Voice similarity (0-1, higher = closer to original)
        
    Returns:
        dict with audio file info
    """
    
    client = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])
    
    audio = client.text_to_speech.convert(
        voice_id=voice_id,
        text=text,
        model_id=model,
        voice_settings=VoiceSettings(
            stability=stability,
            similarity_boost=similarity_boost,
            style=0.0,                  # Exaggeration (0-1)
            use_speaker_boost=True      # Enhance voice clarity
        )
    )
    
    # Stream audio to file
    file_size = 0
    with open(output_path, 'wb') as f:
        for chunk in audio:
            file_size += len(chunk)
            f.write(chunk)
    
    duration = get_audio_duration(output_path)
    
    return {
        'audio_path': output_path,
        'file_size_bytes': file_size,
        'duration_seconds': duration,
        'voice_id': voice_id,
        'model': model,
        'characters': len(text)
    }
```

**Voice Settings:**

| Parameter | Range | Effect | Recommendation |
|-----------|-------|--------|----------------|
| `stability` | 0.0 - 1.0 | Higher = more consistent, Lower = more expressive | 0.5 (balanced) |
| `similarity_boost` | 0.0 - 1.0 | Higher = closer to original voice | 0.75 (high similarity) |
| `style` | 0.0 - 1.0 | Exaggeration of emotion | 0.0 (natural) |
| `use_speaker_boost` | Boolean | Enhance voice clarity | True |

**Model Selection:**

| Model | Languages | Quality | Speed |
|-------|-----------|---------|-------|
| `eleven_multilingual_v2` | 29 languages | Excellent | Moderate |
| `eleven_monolingual_v1` | English only | Good | Fast |
| `eleven_turbo_v2` | English | Good | Very Fast (2x) |

**Recommendation:** Use `eleven_multilingual_v2` for best quality (supports future multi-language expansion).

---

## 6. Audio Format for Telegram

Telegram requires **OGG Opus** format for voice messages.

### Convert MP3 → OGG Opus

```python
def convert_to_telegram_format(
    input_path: str,
    output_path: str
) -> str:
    """
    Convert audio to Telegram-compatible OGG Opus format.
    
    Telegram specs:
    - Format: OGG
    - Codec: Opus
    - Bitrate: 16-32 kbps (voice optimized)
    - Sample rate: 48 kHz
    """
    
    cmd = [
        'ffmpeg',
        '-i', input_path,
        '-c:a', 'libopus',          # Opus codec
        '-b:a', '24k',              # 24 kbps (good quality for voice)
        '-vbr', 'on',               # Variable bitrate
        '-compression_level', '10', # Max compression
        '-ar', '48000',             # 48 kHz sample rate
        '-ac', '1',                 # Mono
        '-y',
        output_path
    ]
    
    subprocess.run(cmd, check=True, capture_output=True)
    
    return output_path
```

**File Size Comparison:**
- Original WAV (44.1kHz): ~5 MB / minute
- MP3 (192kbps): ~1.4 MB / minute
- OGG Opus (24kbps): ~180 KB / minute ✅

---

## 7. Rate Limits & Cost Estimation

### ElevenLabs API Limits

**Creator Plan ($22/month):**
- 100,000 characters/month (~67 minutes of audio)
- Instant voice cloning: Unlimited voices
- Professional cloning: Not available

**Pro Plan ($99/month):**
- 500,000 characters/month (~333 minutes)
- Professional cloning: 30 voices

**Rate Limits:**
- 3 requests/second (across all endpoints)
- Concurrent requests: 2

### Cost Estimation

**Voice Cloning:**
- One-time per persona: Free (included in plan)
- Storage: Free (ElevenLabs hosts voice model)

**TTS Generation:**
| Message Length | Characters | Cost (Creator Plan) |
|----------------|------------|---------------------|
| Short (50 words) | ~300 | $0.00264 |
| Medium (150 words) | ~900 | $0.00792 |
| Long (300 words) | ~1800 | $0.01584 |

**Monthly Volume Examples:**
- 1000 messages/month (avg 150 words) = 900,000 chars = **$79.20/month**
- 500 messages/month (avg 150 words) = 450,000 chars = **$39.60/month**

**Optimization Strategies:**
1. **Cache common responses** (e.g., "Hello, how can I help?")
2. **Limit max response length** (300 words max)
3. **Use fallback to text** if quota exceeded

---

## 8. Voice Management

### List User's Cloned Voices

```python
def list_user_voices(user_id: str) -> list:
    """Get all voices for a user (from ElevenLabs + DB)"""
    
    client = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])
    
    # Get all voices from ElevenLabs
    all_voices = client.voices.get_all()
    
    # Filter by user's personas (match voice_id from DB)
    personas = db.query("SELECT id, name, voice_id FROM personas WHERE user_id = %s", user_id)
    
    user_voice_ids = {p['voice_id'] for p in personas if p['voice_id']}
    
    user_voices = [
        {
            'voice_id': v.voice_id,
            'name': v.name,
            'persona_id': next(p['id'] for p in personas if p['voice_id'] == v.voice_id),
            'created_at': v.created_at
        }
        for v in all_voices.voices
        if v.voice_id in user_voice_ids
    ]
    
    return user_voices
```

### Delete Cloned Voice

```python
def delete_cloned_voice(voice_id: str):
    """Delete voice from ElevenLabs"""
    
    client = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])
    
    client.voices.delete(voice_id)
    
    # Also update DB
    db.query(
        "UPDATE personas SET voice_id = NULL, status = 'voice_deleted' WHERE voice_id = %s",
        voice_id
    )
```

---

## 9. Quality Assurance

### Voice Cloning Quality Checks

```python
def validate_voice_quality(voice_id: str) -> dict:
    """
    Test cloned voice quality with sample phrases.
    
    Returns quality score and issues.
    """
    
    test_phrases = [
        "Hello, this is a test of voice clarity.",
        "The quick brown fox jumps over the lazy dog.",  # Phoneme coverage
        "Can you hear me clearly? Testing one two three.",  # Natural speech
        "I'm excited to help you today!"  # Emotion/energy
    ]
    
    issues = []
    
    for phrase in test_phrases:
        audio_path = generate_tts(voice_id, phrase, f"test_{voice_id}.mp3")
        
        # Check file size (too small = failed generation)
        file_size = os.path.getsize(audio_path)
        if file_size < 10000:  # < 10 KB
            issues.append(f"Audio too short for phrase: {phrase}")
        
        # Future: Run audio quality analysis (SNR, clarity score)
        
        os.remove(audio_path)  # Cleanup
    
    quality_score = 100 - (len(issues) * 25)
    
    return {
        'quality_score': quality_score,
        'passed': len(issues) == 0,
        'issues': issues
    }
```

---

## 10. Error Handling & Retry Logic

### Robust API Calls

```python
import time
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    reraise=True
)
def generate_tts_with_retry(voice_id: str, text: str, output_path: str) -> dict:
    """
    Generate TTS with automatic retry on transient failures.
    
    Retries on:
    - Network errors (connection timeout)
    - Rate limit errors (429)
    - Server errors (500, 502, 503)
    
    Does NOT retry on:
    - Invalid voice_id (404)
    - Quota exceeded (402)
    - Invalid text (400)
    """
    
    try:
        return generate_tts(voice_id, text, output_path)
        
    except APIError as e:
        if e.status_code in [429, 500, 502, 503]:
            # Transient error, will retry
            print(f"Transient error ({e.status_code}), retrying...")
            raise
        else:
            # Permanent error, don't retry
            print(f"Permanent error ({e.status_code}), aborting.")
            raise
```

---

## 11. Monitoring & Analytics

### Track Voice Usage

```sql
-- Add to messages table
ALTER TABLE messages ADD COLUMN voice_generation_ms INTEGER;
ALTER TABLE messages ADD COLUMN voice_characters INTEGER;

-- Query: Average TTS generation time
SELECT AVG(voice_generation_ms) AS avg_ms
FROM messages
WHERE sender = 'persona' AND created_at > NOW() - INTERVAL '7 days';

-- Query: Total characters used (for billing estimates)
SELECT SUM(voice_characters) AS total_chars
FROM messages
WHERE created_at > NOW() - INTERVAL '30 days';
```

---

**Last updated:** 2025-02-18  
**Version:** 1.0 (MVP)
