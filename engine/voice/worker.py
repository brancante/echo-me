"""HeyGen training worker — accepts YouTube or uploaded video and submits training job."""

import json
import logging
import subprocess
import time
from pathlib import Path

import redis
import requests
from sqlalchemy import text

from config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [voice] %(message)s")
logger = logging.getLogger(__name__)

redis_client = redis.from_url(settings.redis_url)


def download_video_from_youtube(youtube_url: str, output_dir: Path) -> Path:
    """Download a local mp4 from YouTube using yt-dlp."""
    output_path = output_dir / "source.%(ext)s"
    cmd = [
        "yt-dlp",
        "-f",
        "mp4/best",
        "--no-playlist",
        "-o",
        str(output_path),
        youtube_url,
    ]
    subprocess.run(cmd, check=True)

    for f in output_dir.iterdir():
        if f.suffix.lower() in (".mp4", ".mov", ".mkv", ".webm"):
            return f

    raise FileNotFoundError(f"No video file found in {output_dir}")


def normalize_video(input_path: Path, output_path: Path) -> Path:
    """Normalize video to mp4+h264+aac for compatibility with training APIs."""
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(input_path),
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-c:a",
        "aac",
        "-ar",
        "44100",
        "-ac",
        "1",
        str(output_path),
    ]
    subprocess.run(cmd, check=True)
    return output_path


def submit_heygen_training(video_path: Path, persona_name: str, heygen_api_key: str) -> dict:
    """Submit training request to HeyGen.

    NOTE: endpoint may vary by account/feature access.
    Configure with HEYGEN_TRAIN_ENDPOINT when needed.
    """
    if not heygen_api_key:
        raise ValueError("HEYGEN_API_KEY not configured for user")

    endpoint = settings.heygen_train_endpoint or f"{settings.heygen_base_url.rstrip('/')}/v1/digital_twin/create"

    headers = {
        "X-API-KEY": heygen_api_key,
    }

    with open(video_path, "rb") as f:
        files = {"video": (video_path.name, f, "video/mp4")}
        data = {"name": persona_name}
        response = requests.post(endpoint, headers=headers, files=files, data=data, timeout=300)

    if response.status_code >= 400:
        raise RuntimeError(f"HeyGen API error {response.status_code}: {response.text}")

    payload = response.json() if response.content else {}

    # Handle common response formats with fallback.
    data_obj = payload.get("data", payload)
    return {
        "provider": "heygen",
        "training_id": data_obj.get("training_id") or data_obj.get("id"),
        "avatar_id": data_obj.get("avatar_id") or data_obj.get("digital_twin_id"),
        "voice_id": data_obj.get("voice_id"),
        "raw": payload,
    }


def get_user_heygen_key(user_id: str) -> str:
    from db import get_db

    with get_db() as db:
        row = db.execute(
            text(
                """
                SELECT encrypted_key
                FROM api_keys
                WHERE user_id = :uid AND provider = 'heygen'
                ORDER BY created_at DESC
                LIMIT 1
                """
            ),
            {"uid": user_id},
        ).fetchone()

    if row and row[0]:
        return str(row[0]).strip()

    return settings.heygen_api_key


def process_heygen_train_job(job_id: str, user_id: str, persona_name: str, youtube_url=None, uploaded_video_path=None):
    from db import get_db

    work_dir = Path(settings.data_dir) / "video" / user_id / job_id
    work_dir.mkdir(parents=True, exist_ok=True)

    with get_db() as db:
        db.execute(text("UPDATE jobs SET status = 'processing', started_at = NOW() WHERE id = :id"), {"id": job_id})
        db.execute(text("UPDATE personas SET voice_status = 'processing' WHERE user_id = :uid"), {"uid": user_id})

    try:
        if uploaded_video_path:
            input_video = Path(uploaded_video_path)
            if not input_video.exists():
                raise FileNotFoundError(f"Uploaded video not found: {uploaded_video_path}")
        elif youtube_url:
            logger.info(f"Downloading training video from {youtube_url}")
            input_video = download_video_from_youtube(youtube_url, work_dir)
        else:
            raise ValueError("Missing training source (youtube_url or uploaded_video_path)")

        prepared_video = work_dir / "prepared.mp4"
        normalize_video(input_video, prepared_video)

        user_heygen_key = get_user_heygen_key(user_id)
        result = submit_heygen_training(prepared_video, persona_name, user_heygen_key)

        with get_db() as db:
            db.execute(
                text("""
                    UPDATE personas
                    SET voice_id = :voice_id,
                        voice_status = 'ready',
                        updated_at = NOW()
                    WHERE user_id = :uid
                """),
                {"voice_id": result.get("voice_id"), "uid": user_id},
            )
            db.execute(
                text("UPDATE jobs SET status = 'completed', completed_at = NOW(), output = :out WHERE id = :id"),
                {"out": json.dumps(result), "id": job_id},
            )

        logger.info(f"HeyGen job {job_id} completed")

    except Exception as e:
        logger.error(f"HeyGen job {job_id} failed: {e}")
        with get_db() as db:
            db.execute(text("UPDATE personas SET voice_status = 'failed', updated_at = NOW() WHERE user_id = :uid"), {"uid": user_id})
            db.execute(
                text("UPDATE jobs SET status = 'failed', error = :err, completed_at = NOW() WHERE id = :id"),
                {"err": str(e), "id": job_id},
            )


if __name__ == "__main__":
    logger.info("Voice worker started — listening on Redis queue 'voice_clone'...")
    from db import get_db

    while True:
        try:
            result = redis_client.blpop("voice_clone", timeout=5)
            if not result:
                continue

            _, job_id_bytes = result
            job_id = job_id_bytes.decode("utf-8")
            logger.info(f"Processing job {job_id}")

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

            if job_type != "heygen_train":
                logger.info(f"Skipping unsupported job type {job_type}")
                continue

            process_heygen_train_job(
                job_id=job_id,
                user_id=user_id,
                persona_name=job_input.get("persona_name", "Echo Avatar"),
                youtube_url=job_input.get("youtube_url"),
                uploaded_video_path=job_input.get("uploaded_video_path"),
            )

        except Exception as e:
            logger.error(f"Worker error: {e}")
            time.sleep(5)
