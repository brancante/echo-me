"""Voice cloning worker — downloads YouTube audio, extracts, clones via ElevenLabs."""

import os
import subprocess
import logging
import json
import time
import redis
from pathlib import Path

from config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [voice] %(message)s")
logger = logging.getLogger(__name__)

# Redis client
redis_client = redis.from_url(settings.redis_url)


def download_audio(youtube_url: str, output_dir: Path) -> Path:
    """Download audio from YouTube using yt-dlp."""
    output_path = output_dir / "source.%(ext)s"
    cmd = [
        "yt-dlp",
        "-x", "--audio-format", "wav",
        "--audio-quality", "0",
        "-o", str(output_path),
        youtube_url,
    ]
    subprocess.run(cmd, check=True)
    # yt-dlp outputs as source.wav
    wav_path = output_dir / "source.wav"
    if not wav_path.exists():
        # fallback: find any audio file
        for f in output_dir.iterdir():
            if f.suffix in (".wav", ".mp3", ".m4a"):
                return f
        raise FileNotFoundError(f"No audio file found in {output_dir}")
    return wav_path


def clean_audio(input_path: Path, output_path: Path) -> Path:
    """Clean audio with ffmpeg — normalize, mono, 44.1kHz."""
    cmd = [
        "ffmpeg", "-y", "-i", str(input_path),
        "-ac", "1", "-ar", "44100",
        "-filter:a", "loudnorm",
        str(output_path),
    ]
    subprocess.run(cmd, check=True)
    return output_path


def clone_voice(audio_path: Path, name: str) -> str:
    """Clone voice via ElevenLabs API. Returns voice_id."""
    from elevenlabs import ElevenLabs

    client = ElevenLabs(api_key=settings.elevenlabs_api_key)
    with open(audio_path, "rb") as f:
        voice = client.clone(name=name, files=[f])
    logger.info(f"Voice cloned: {voice.voice_id}")
    return voice.voice_id


def process_job(job_id: str, user_id: str, youtube_url: str, persona_name: str):
    """Full voice cloning pipeline for a single job."""
    from db import get_db

    work_dir = Path(settings.data_dir) / "audio" / user_id / job_id
    work_dir.mkdir(parents=True, exist_ok=True)

    with get_db() as db:
        # Mark job as processing
        db.execute(
            "UPDATE jobs SET status = 'processing', started_at = NOW() WHERE id = :id",
            {"id": job_id},
        )

    try:
        logger.info(f"Downloading audio from {youtube_url}")
        raw_audio = download_audio(youtube_url, work_dir)

        logger.info("Cleaning audio")
        clean_path = work_dir / "clean.wav"
        clean_audio(raw_audio, clean_path)

        logger.info("Cloning voice via ElevenLabs")
        voice_id = clone_voice(clean_path, persona_name)

        with get_db() as db:
            db.execute(
                "UPDATE personas SET voice_id = :vid, voice_status = 'ready' WHERE user_id = :uid",
                {"vid": voice_id, "uid": user_id},
            )
            db.execute(
                "UPDATE jobs SET status = 'completed', completed_at = NOW(), output = :out WHERE id = :id",
                {"out": f'{{"voice_id": "{voice_id}"}}', "id": job_id},
            )
        logger.info(f"Job {job_id} completed — voice_id: {voice_id}")

    except Exception as e:
        logger.error(f"Job {job_id} failed: {e}")
        with get_db() as db:
            db.execute(
                "UPDATE jobs SET status = 'failed', error = :err, completed_at = NOW() WHERE id = :id",
                {"err": str(e), "id": job_id},
            )


if __name__ == "__main__":
    logger.info("Voice worker started — listening on Redis queue 'voice_clone'...")
    from db import get_db

    while True:
        try:
            # Block on Redis queue (BLPOP with 5 second timeout)
            result = redis_client.blpop("voice_clone", timeout=5)
            
            if result:
                _, job_id_bytes = result
                job_id = job_id_bytes.decode("utf-8")
                
                logger.info(f"Processing job {job_id}")
                
                # Fetch job details from DB
                with get_db() as db:
                    job_row = db.execute(
                        "SELECT user_id, input FROM jobs WHERE id = :id",
                        {"id": job_id}
                    ).fetchone()
                
                if not job_row:
                    logger.error(f"Job {job_id} not found in database")
                    continue
                
                user_id = str(job_row[0])
                job_input = json.loads(job_row[1]) if isinstance(job_row[1], str) else job_row[1]
                
                youtube_url = job_input.get("youtube_url")
                persona_name = job_input.get("persona_name", "Echo Voice")
                
                if not youtube_url:
                    logger.error(f"Job {job_id} missing youtube_url")
                    with get_db() as db:
                        db.execute(
                            "UPDATE jobs SET status = 'failed', error = 'Missing youtube_url' WHERE id = :id",
                            {"id": job_id}
                        )
                    continue
                
                process_job(job_id, user_id, youtube_url, persona_name)
                
        except Exception as e:
            logger.error(f"Worker error: {e}")
            time.sleep(5)
