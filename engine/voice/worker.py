"""Voice cloning worker — downloads YouTube audio, extracts, clones via ElevenLabs."""

import os
import subprocess
import logging
import json
import time
import redis
import requests
from pathlib import Path
from sqlalchemy import text

from config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [voice] %(message)s")
logger = logging.getLogger(__name__)

# Redis client
redis_client = redis.from_url(settings.redis_url)


def download_audio(youtube_url: str, output_dir: Path) -> Path:
    """Download audio from YouTube. Prefer RapidAPI, fallback to yt-dlp."""
    # 1) RapidAPI path (more reliable than yt-dlp on some hosts)
    if settings.rapidapi_key:
        try:
            logger.info("Trying RapidAPI YouTube MP3 downloader")
            if settings.rapidapi_host == "yt-search-and-download-mp3.p.rapidapi.com":
                api_resp = requests.get(
                    "https://yt-search-and-download-mp3.p.rapidapi.com/mp3",
                    params={"url": youtube_url},
                    headers={
                        "x-rapidapi-host": settings.rapidapi_host,
                        "x-rapidapi-key": settings.rapidapi_key,
                    },
                    timeout=30,
                )
                api_resp.raise_for_status()
                payload = api_resp.json()
                dl_url = payload.get("download") or payload.get("downloadUrl")
            else:
                api_resp = requests.get(
                    "https://youtube-mp310.p.rapidapi.com/download/mp3",
                    params={"url": youtube_url},
                    headers={
                        "x-rapidapi-host": settings.rapidapi_host,
                        "x-rapidapi-key": settings.rapidapi_key,
                    },
                    timeout=30,
                )
                api_resp.raise_for_status()
                payload = api_resp.json()
                dl_url = payload.get("downloadUrl") or payload.get("download")

            if dl_url:
                mp3_path = output_dir / "source.mp3"
                with requests.get(dl_url, timeout=120, stream=True) as r:
                    r.raise_for_status()
                    with open(mp3_path, "wb") as f:
                        for chunk in r.iter_content(chunk_size=8192):
                            if chunk:
                                f.write(chunk)
                if mp3_path.exists() and mp3_path.stat().st_size > 0:
                    return mp3_path
        except Exception as e:
            logger.warning(f"RapidAPI download failed, fallback to yt-dlp: {e}")

    # 2) yt-dlp fallback
    output_path = output_dir / "source.%(ext)s"
    cmd = [
        "yt-dlp",
        "-x", "--audio-format", "wav",
        "--audio-quality", "0",
        "--extractor-args", "youtube:player_client=android,web",
        "--no-playlist",
        "-o", str(output_path),
        youtube_url,
    ]
    subprocess.run(cmd, check=True)

    wav_path = output_dir / "source.wav"
    if wav_path.exists():
        return wav_path

    for f in output_dir.iterdir():
        if f.suffix in (".wav", ".mp3", ".m4a"):
            return f

    raise FileNotFoundError(f"No audio file found in {output_dir}")


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


def process_extract_job(job_id: str, user_id: str, youtube_url: str):
    """Extract MP3 only for user preview."""
    from db import get_db

    work_dir = Path(settings.data_dir) / "audio" / user_id / job_id
    work_dir.mkdir(parents=True, exist_ok=True)

    with get_db() as db:
        db.execute(text("UPDATE jobs SET status = 'processing', started_at = NOW() WHERE id = :id"), {"id": job_id})

    try:
        raw_audio = download_audio(youtube_url, work_dir)
        mp3_path = work_dir / "extracted.mp3"
        subprocess.run(["ffmpeg", "-y", "-i", str(raw_audio), str(mp3_path)], check=True)

        with get_db() as db:
            db.execute(
                text("UPDATE jobs SET status = 'completed', completed_at = NOW(), output = :out WHERE id = :id"),
                {"out": json.dumps({"audio_path": str(mp3_path), "audio_file": mp3_path.name}), "id": job_id},
            )
        logger.info(f"Extract job {job_id} completed")
    except Exception as e:
        logger.error(f"Extract job {job_id} failed: {e}")
        with get_db() as db:
            db.execute(
                text("UPDATE jobs SET status = 'failed', error = :err, completed_at = NOW() WHERE id = :id"),
                {"err": str(e), "id": job_id},
            )


def process_clone_job(job_id: str, user_id: str, persona_name: str, youtube_url=None, audio_path=None):
    """Clone voice from YouTube URL (legacy) or an extracted audio path."""
    from db import get_db

    work_dir = Path(settings.data_dir) / "audio" / user_id / job_id
    work_dir.mkdir(parents=True, exist_ok=True)

    with get_db() as db:
        db.execute(text("UPDATE jobs SET status = 'processing', started_at = NOW() WHERE id = :id"), {"id": job_id})

    try:
        if audio_path:
            raw_audio = Path(audio_path)
        elif youtube_url:
            logger.info(f"Downloading audio from {youtube_url}")
            raw_audio = download_audio(youtube_url, work_dir)
        else:
            raise ValueError("Missing audio source for clone")

        clean_path = work_dir / "clean.wav"
        clean_audio(raw_audio, clean_path)

        voice_id = clone_voice(clean_path, persona_name)

        with get_db() as db:
            db.execute(text("UPDATE personas SET voice_id = :vid, voice_status = 'ready' WHERE user_id = :uid"), {"vid": voice_id, "uid": user_id})
            db.execute(
                text("UPDATE jobs SET status = 'completed', completed_at = NOW(), output = :out WHERE id = :id"),
                {"out": json.dumps({"voice_id": voice_id}), "id": job_id},
            )
        logger.info(f"Clone job {job_id} completed — voice_id: {voice_id}")

    except Exception as e:
        logger.error(f"Clone job {job_id} failed: {e}")
        with get_db() as db:
            db.execute(
                text("UPDATE jobs SET status = 'failed', error = :err, completed_at = NOW() WHERE id = :id"),
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
                        text("SELECT user_id, type, input FROM jobs WHERE id = :id"),
                        {"id": job_id}
                    ).fetchone()

                if not job_row:
                    logger.error(f"Job {job_id} not found in database")
                    continue

                user_id = str(job_row[0])
                job_type = str(job_row[1])
                job_input = json.loads(job_row[2]) if isinstance(job_row[2], str) else job_row[2]

                if job_type == "voice_extract":
                    youtube_url = job_input.get("youtube_url")
                    if not youtube_url:
                        raise ValueError("Missing youtube_url")
                    process_extract_job(job_id, user_id, youtube_url)
                    continue

                persona_name = job_input.get("persona_name", "Echo Voice")

                if job_type == "voice_clone_from_extract":
                    audio_path = job_input.get("audio_path")
                    process_clone_job(job_id, user_id, persona_name, audio_path=audio_path)
                    continue

                # legacy/default voice_clone from youtube_url
                youtube_url = job_input.get("youtube_url")
                if not youtube_url:
                    raise ValueError("Missing youtube_url")
                process_clone_job(job_id, user_id, persona_name, youtube_url=youtube_url)
                
        except Exception as e:
            logger.error(f"Worker error: {e}")
            time.sleep(5)
