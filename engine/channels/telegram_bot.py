"""Telegram bot — handles incoming messages, generates persona responses with TTS."""

import json
import logging
from pathlib import Path
from uuid import uuid4

from telegram import Update
from telegram.ext import Application, MessageHandler, filters, ContextTypes

from config import settings
from db import get_db
from llm.chain import generate_response
from llm.tts import text_to_speech

logging.basicConfig(level=logging.INFO, format="%(asctime)s [telegram] %(message)s")
logger = logging.getLogger(__name__)

RESPONSE_DIR = Path(settings.data_dir) / "audio" / "responses"
RESPONSE_DIR.mkdir(parents=True, exist_ok=True)


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle incoming Telegram message."""
    if not update.message or not update.message.text:
        return

    chat_id = str(update.message.chat_id)
    user_text = update.message.text
    telegram_user = update.message.from_user

    logger.info(f"Message from {telegram_user.first_name} ({chat_id}): {user_text}")

    # Find the persona linked to this bot (MVP: first active persona)
    with get_db() as db:
        persona_row = db.execute(
            "SELECT p.id, p.user_id, p.name, p.voice_id, p.auto_profile, p.manual_overrides "
            "FROM personas p WHERE p.voice_status = 'ready' LIMIT 1"
        ).fetchone()

    if not persona_row:
        await update.message.reply_text("⚠️ No persona configured yet. Please set up a persona in the dashboard.")
        return

    persona = {
        "id": str(persona_row[0]),
        "user_id": str(persona_row[1]),
        "name": persona_row[2],
        "voice_id": persona_row[3],
        "auto_profile": persona_row[4] if isinstance(persona_row[4], dict) else json.loads(persona_row[4] or "{}"),
        "manual_overrides": persona_row[5] if isinstance(persona_row[5], dict) else json.loads(persona_row[5] or "{}"),
    }

    # Lookup client
    client_name = telegram_user.first_name
    client_notes = None
    with get_db() as db:
        client_row = db.execute(
            "SELECT name, notes FROM clients WHERE telegram_id = :tid",
            {"tid": str(telegram_user.id)},
        ).fetchone()
        if client_row:
            client_name = client_row[0] or client_name
            client_notes = client_row[1]

    # Generate response
    try:
        response_text = generate_response(
            persona=persona,
            user_id=persona["user_id"],
            question=user_text,
            client_name=client_name,
            client_notes=client_notes,
        )

        # Generate TTS if voice is available
        if persona["voice_id"]:
            message_id = str(uuid4())
            audio_path = text_to_speech(
                text=response_text,
                voice_id=persona["voice_id"],
                output_dir=RESPONSE_DIR,
                message_id=message_id,
            )
            with open(audio_path, "rb") as audio:
                await update.message.reply_voice(voice=audio, caption=response_text[:1024])
        else:
            await update.message.reply_text(response_text)

        # Log conversation
        with get_db() as db:
            conv_id = str(uuid4())
            db.execute(
                "INSERT INTO conversations (id, persona_id, channel, channel_chat_id) "
                "VALUES (:id, :pid, 'telegram', :cid)",
                {"id": conv_id, "pid": persona["id"], "cid": chat_id},
            )
            db.execute(
                "INSERT INTO messages (conversation_id, role, content) VALUES (:cid, 'user', :content)",
                {"cid": conv_id, "content": user_text},
            )
            db.execute(
                "INSERT INTO messages (conversation_id, role, content, audio_url) VALUES (:cid, 'assistant', :content, :audio)",
                {"cid": conv_id, "content": response_text, "audio": str(audio_path) if persona["voice_id"] else None},
            )

    except Exception as e:
        logger.error(f"Error generating response: {e}")
        await update.message.reply_text("Sorry, I'm having trouble right now. Please try again later.")


def main():
    """Start the Telegram bot."""
    app = Application.builder().token(settings.telegram_bot_token).build()
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    logger.info("Telegram bot started")
    app.run_polling()


if __name__ == "__main__":
    main()
