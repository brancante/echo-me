"""Persona extraction worker — extracts audio, transcribes it, and analyzes with LLM."""

import json
import logging
import subprocess
import time
from pathlib import Path

import redis
from openai import OpenAI
from sqlalchemy import text

from config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [persona] %(message)s")
logger = logging.getLogger(__name__)

redis_client = redis.from_url(settings.redis_url)

PERSONA_EXTRACTION_PROMPT = """Analyze this transcript from a video/audio and extract a detailed persona profile.

Return a JSON object with these fields:
{
  "name": "speaker's name if mentioned (otherwise null)",
  "tone": "formal/casual/energetic/calm/etc",
  "vocabulary_level": "simple/intermediate/advanced",
  "speech_patterns": ["list of catchphrases, fillers, recurring expressions"],
  "selling_approach": "description of how they sell/persuade (if applicable)",
  "personality_traits": ["trait1", "trait2", ...],
  "common_expressions": ["expression1", "expression2", ...],
  "communication_style": "description of overall style",
  "dos": ["things the persona always does"],
  "donts": ["things the persona never does"],
  "backstory_hints": "any background info gleaned from the transcript"
}

Transcript:
---
{transcript}
---

Return ONLY valid JSON, no markdown formatting blocks."""


def extract_audio_from_video(video_path: Path, output_path: Path) -> Path:
    """Extract audio from video file to a highly compressed mp3 for Whisper API."""
    logger.info(f"Extracting audio from {video_path} to {output_path}")
    cmd = [
        "ffmpeg",
        "-y",
        "-i", str(video_path),
        "-vn",                 # No video
        "-acodec", "libmp3lame",
        "-ar", "16000",        # 16kHz is enough for Whisper
        "-ac", "1",            # Mono
        "-b:a", "32k",         # 32kbps to keep file size small
        str(output_path)
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return output_path


def transcribe_audio(audio_path: Path) -> str:
    """Transcribe audio using OpenAI Whisper API."""
    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY not configured")
    
    client = OpenAI(api_key=settings.openai_api_key)
    
    # Whisper has a 25MB file limit. The 32kbps mp3 should be very small (~240KB per minute).
    if audio_path.stat().st_size > 25 * 1024 * 1024:
        logger.warning(f"Audio file {audio_path.name} is larger than 25MB. Whisper might fail.")

    with open(audio_path, "rb") as f:
        result = client.audio.transcriptions.create(model="whisper-1", file=f)
    return result.text


def extract_persona(transcript: str) -> dict:
    """Use LLM to extract persona traits from transcript."""
    client = OpenAI(api_key=settings.openai_api_key)
    
    # Trim transcript to ~15000 characters to avoid context length limits
    truncated_transcript = transcript[:15000]
    
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are an expert at analyzing communication styles and extracting persona profiles."},
            {"role": "user", "content": PERSONA_EXTRACTION_PROMPT.format(transcript=truncated_transcript)},
        ],
        response_format={"type": "json_object"},
        temperature=0.3,
    )
    
    return json.loads(response.choices[0].message.content)


def process_persona_job(job_id: str, user_id: str, persona_id: str):
    """Full persona extraction pipeline."""
    from db import get_db

    with get_db() as db:
        db.execute(
            text("UPDATE jobs SET status = 'processing', started_at = NOW() WHERE id = :id"),
            {"id": job_id},
        )

    try:
        # Step 1: Find the latest prepared video or audio file for this user
        video_dir = Path(settings.data_dir) / "video" / user_id
        audio_dir = Path(settings.data_dir) / "audio" / user_id
        
        source_file = None
        
        # Check video dir first (HeyGen pipeline)
        if video_dir.exists():
            for d in sorted(video_dir.iterdir(), reverse=True):
                candidate = d / "prepared.mp4"
                if candidate.exists():
                    source_file = candidate
                    break
                candidate2 = d / "source.mp4"
                if candidate2.exists():
                    source_file = candidate2
                    break
        
        # Fallback to audio dir if needed
        if not source_file and audio_dir.exists():
            for d in sorted(audio_dir.iterdir(), reverse=True):
                candidate = d / "clean.wav"
                if candidate.exists():
                    source_file = candidate
                    break
                    
        if not source_file:
            raise FileNotFoundError(f"No video/audio source found for user {user_id}")

        logger.info(f"Found source media: {source_file}")
        
        work_dir = Path(settings.data_dir) / "persona" / user_id / job_id
        work_dir.mkdir(parents=True, exist_ok=True)
        
        audio_file = source_file
        
        # If it's a video, extract the audio
        if source_file.suffix.lower() in [".mp4", ".mov", ".webm", ".mkv"]:
            audio_file = work_dir / "extracted.mp3"
            extract_audio_from_video(source_file, audio_file)
            
        logger.info(f"Transcribing {audio_file.name}")
        transcript = transcribe_audio(audio_file)
        
        if not transcript.strip():
            raise ValueError("Transcription resulted in empty text")

        logger.info("Extracting persona traits via LLM")
        profile = extract_persona(transcript)

        with get_db() as db:
            db.execute(
                text("""
                    UPDATE personas 
                    SET transcript = :t, 
                        auto_profile = :p, 
                        updated_at = NOW() 
                    WHERE id = :pid
                """),
                {"t": transcript, "p": json.dumps(profile), "pid": persona_id},
            )
            db.execute(
                text("""
                    UPDATE jobs 
                    SET status = 'completed', 
                        completed_at = NOW(), 
                        output = :out 
                    WHERE id = :id
                """),
                {"out": json.dumps(profile), "id": job_id},
            )
            
        logger.info(f"✅ Persona extraction complete for {persona_id}")

    except Exception as e:
        logger.error(f"❌ Job {job_id} failed: {e}", exc_info=True)
        with get_db() as db:
            db.execute(
                text("""
                    UPDATE jobs 
                    SET status = 'failed', 
                        error = :err, 
                        completed_at = NOW() 
                    WHERE id = :id
                """),
                {"err": str(e), "id": job_id},
            )


if __name__ == "__main__":
    queue_name = "queue:persona_extract"
    logger.info(f"🚀 Persona worker started — listening on Redis queue '{queue_name}'...")
    from db import get_db

    while True:
        try:
            # Block until a job appears in the queue
            result = redis_client.blpop(queue_name, timeout=5)
            
            if not result:
                continue

            _, job_id_bytes = result
            job_id = job_id_bytes.decode("utf-8")
            logger.info(f"📥 Processing job {job_id}")

            with get_db() as db:
                job_row = db.execute(
                    text("SELECT user_id, type, input FROM jobs WHERE id = :id"),
                    {"id": job_id},
                ).fetchone()

            if not job_row:
                logger.error(f"Job {job_id} not found in database")
                continue

            user_id = str(job_row[0])
            job_type = str(job_row[1])
            job_input = json.loads(job_row[2]) if isinstance(job_row[2], str) else job_row[2]

            if job_type != "persona_extract":
                logger.warning(f"Skipping unsupported job type: {job_type}")
                continue

            persona_id = job_input.get("persona_id")
            if not persona_id:
                logger.error("Job missing persona_id in input")
                continue

            process_persona_job(
                job_id=job_id,
                user_id=user_id,
                persona_id=persona_id,
            )

        except KeyboardInterrupt:
            logger.info("🛑 Worker stopped by user")
            break
        except Exception as e:
            logger.error(f"Worker error: {e}", exc_info=True)
            time.sleep(5)
