"""TTS module — converts text to speech using ElevenLabs cloned voice."""

import logging
import subprocess
from pathlib import Path

from elevenlabs import ElevenLabs

from config import settings

logger = logging.getLogger(__name__)


def text_to_speech(text: str, voice_id: str, output_dir: Path, message_id: str) -> Path:
    """Generate speech audio from text using cloned voice.
    
    Returns path to the generated .ogg file (Telegram-compatible).
    """
    client = ElevenLabs(api_key=settings.elevenlabs_api_key)

    # Generate MP3
    mp3_path = output_dir / f"{message_id}.mp3"
    audio = client.text_to_speech.convert(
        voice_id=voice_id,
        text=text,
        model_id="eleven_multilingual_v2",
        output_format="mp3_44100_128",
    )

    with open(mp3_path, "wb") as f:
        for chunk in audio:
            f.write(chunk)

    # Convert to OGG/Opus for Telegram
    ogg_path = output_dir / f"{message_id}.ogg"
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(mp3_path), "-c:a", "libopus", "-b:a", "64k", str(ogg_path)],
        check=True,
        capture_output=True,
    )

    # Cleanup MP3
    mp3_path.unlink(missing_ok=True)

    logger.info(f"TTS generated: {ogg_path}")
    return ogg_path
