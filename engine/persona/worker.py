"""Persona extraction worker — transcribes audio, analyzes with LLM to extract persona traits."""

import json
import logging
from pathlib import Path

from openai import OpenAI
from config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [persona] %(message)s")
logger = logging.getLogger(__name__)

PERSONA_EXTRACTION_PROMPT = """Analyze this transcript from a YouTube video and extract a detailed persona profile.

Return a JSON object with these fields:
{
  "name": "speaker's name if mentioned",
  "tone": "formal/casual/energetic/calm/etc",
  "vocabulary_level": "simple/intermediate/advanced",
  "speech_patterns": ["list of catchphrases, fillers, recurring expressions"],
  "selling_approach": "description of how they sell/persuade",
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

Return ONLY valid JSON, no markdown."""


def transcribe_audio(audio_path: Path) -> str:
    """Transcribe audio using OpenAI Whisper API."""
    client = OpenAI(api_key=settings.openai_api_key)
    with open(audio_path, "rb") as f:
        result = client.audio.transcriptions.create(model="whisper-1", file=f)
    return result.text


def extract_persona(transcript: str) -> dict:
    """Use LLM to extract persona traits from transcript."""
    client = OpenAI(api_key=settings.openai_api_key)
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are an expert at analyzing communication styles and extracting persona profiles."},
            {"role": "user", "content": PERSONA_EXTRACTION_PROMPT.format(transcript=transcript[:15000])},
        ],
        response_format={"type": "json_object"},
        temperature=0.3,
    )
    return json.loads(response.choices[0].message.content)


def process_job(job_id: str, user_id: str, persona_id: str):
    """Full persona extraction pipeline."""
    from db import get_db

    with get_db() as db:
        db.execute("UPDATE jobs SET status = 'processing', started_at = NOW() WHERE id = :id", {"id": job_id})

    try:
        # Find the audio file
        audio_dir = Path(settings.data_dir) / "audio" / user_id
        audio_file = None
        for d in sorted(audio_dir.iterdir(), reverse=True):
            candidate = d / "clean.wav"
            if candidate.exists():
                audio_file = candidate
                break

        if not audio_file:
            raise FileNotFoundError(f"No audio found for user {user_id}")

        logger.info(f"Transcribing {audio_file}")
        transcript = transcribe_audio(audio_file)

        logger.info("Extracting persona traits via LLM")
        profile = extract_persona(transcript)

        with get_db() as db:
            db.execute(
                "UPDATE personas SET transcript = :t, auto_profile = :p, updated_at = NOW() WHERE id = :pid",
                {"t": transcript, "p": json.dumps(profile), "pid": persona_id},
            )
            db.execute(
                "UPDATE jobs SET status = 'completed', completed_at = NOW(), output = :out WHERE id = :id",
                {"out": json.dumps(profile), "id": job_id},
            )
        logger.info(f"Persona extraction complete for {persona_id}")

    except Exception as e:
        logger.error(f"Job {job_id} failed: {e}")
        with get_db() as db:
            db.execute(
                "UPDATE jobs SET status = 'failed', error = :err, completed_at = NOW() WHERE id = :id",
                {"err": str(e), "id": job_id},
            )


if __name__ == "__main__":
    logger.info("Persona worker started — polling for jobs...")
    import time

    while True:
        from db import get_db

        with get_db() as db:
            result = db.execute(
                "SELECT j.id, j.user_id, j.input FROM jobs j "
                "WHERE j.type = 'persona_extract' AND j.status = 'pending' "
                "ORDER BY j.created_at LIMIT 1"
            ).fetchone()

        if result:
            job_input = json.loads(result[2]) if isinstance(result[2], str) else result[2]
            process_job(
                job_id=str(result[0]),
                user_id=str(result[1]),
                persona_id=job_input["persona_id"],
            )
        else:
            time.sleep(5)
