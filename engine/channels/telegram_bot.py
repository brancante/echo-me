"""Telegram bot — handles incoming messages using the new Chat Engine via Redis queue."""

import json
import time
import logging
from pathlib import Path
from uuid import uuid4
from sqlalchemy import text

import redis
from telegram import Update
from telegram.ext import Application, MessageHandler, filters, ContextTypes

from config import settings
from db import get_db

logging.basicConfig(level=logging.INFO, format="%(asctime)s [telegram] %(message)s")
logger = logging.getLogger(__name__)

# Connect to Redis
redis_client = redis.from_url(settings.redis_url)

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle incoming Telegram message."""
    if not update.message or not update.message.text:
        return

    chat_id = str(update.message.chat_id)
    user_text = update.message.text
    telegram_user = update.message.from_user

    logger.info(f"Message from {telegram_user.first_name} ({chat_id}): {user_text}")

    # Send typing indicator immediately
    try:
        await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")
    except Exception as e:
        logger.warning(f"Could not send typing action: {e}")

    # Find the persona linked to this bot (MVP: first active persona)
    # This also gives us the Echo Me user_id to associate the job with
    with get_db() as db:
        persona_row = db.execute(
            text("SELECT id, user_id, name, voice_id "
                 "FROM personas WHERE voice_status = 'ready' LIMIT 1")
        ).fetchone()

    if not persona_row:
        await update.message.reply_text("⚠️ No persona configured yet. Please set up a persona in the dashboard.")
        return

    persona_id = str(persona_row[0])
    user_id = str(persona_row[1])
    persona_name = persona_row[2]
    voice_id = persona_row[3]

    # Map Telegram user to an Echo Me client or create one
    client_id = None
    with get_db() as db:
        client_row = db.execute(
            text("SELECT id, name FROM clients WHERE telegram_id = :tid"),
            {"tid": str(telegram_user.id)}
        ).fetchone()
        
        if client_row:
            client_id = str(client_row[0])
            client_name = client_row[1] or telegram_user.first_name
        else:
            client_id = str(uuid4())
            client_name = telegram_user.first_name
            db.execute(
                text("INSERT INTO clients (id, user_id, name, telegram_id) "
                     "VALUES (:id, :uid, :name, :tid)"),
                {"id": client_id, "uid": user_id, "name": client_name, "tid": str(telegram_user.id)}
            )

    # We need to fetch the last few messages for conversation history
    # 1. Find or create conversation
    conv_id = None
    with get_db() as db:
        conv_row = db.execute(
            text("SELECT id FROM conversations WHERE persona_id = :pid AND channel_chat_id = :cid ORDER BY created_at DESC LIMIT 1"),
            {"pid": persona_id, "cid": chat_id}
        ).fetchone()
        
        if conv_row:
            conv_id = str(conv_row[0])
        else:
            conv_id = str(uuid4())
            db.execute(
                text("INSERT INTO conversations (id, persona_id, client_id, channel, channel_chat_id) "
                     "VALUES (:id, :pid, :clid, 'telegram', :cid)"),
                {"id": conv_id, "pid": persona_id, "clid": client_id, "cid": chat_id}
            )

        # Record incoming message
        db.execute(
            text("INSERT INTO messages (conversation_id, role, content) VALUES (:cid, 'user', :content)"),
            {"cid": conv_id, "content": user_text}
        )
        
        # Fetch history
        history_rows = db.execute(
            text("SELECT role, content FROM messages WHERE conversation_id = :cid ORDER BY created_at ASC LIMIT 10"),
            {"cid": conv_id}
        ).fetchall()
        
        conversation_history = [{"role": row[0], "content": row[1]} for row in history_rows]

    # Create Job for Chat Engine
    job_id = str(uuid4())
    job_input = {
        "message": user_text,
        "client_id": client_id,
        "generate_audio": True if voice_id else False,
        "conversation_history": conversation_history[:-1] # Exclude the message we just added
    }
    
    with get_db() as db:
        db.execute(
            text("INSERT INTO jobs (id, user_id, type, status, input) VALUES (:id, :uid, 'chat', 'pending', :input)"),
            {"id": job_id, "uid": user_id, "input": json.dumps(job_input)}
        )
        
    # Push to Redis
    redis_job = {
        "job_id": job_id,
        "user_id": user_id,
        "message": user_text,
        "client_id": client_id,
        "generate_audio": True if voice_id else False,
        "conversation_history": conversation_history[:-1]
    }
    redis_client.rpush("queue:chat", json.dumps(redis_job))
    logger.info(f"Queued chat job {job_id} for user {user_id}")

    # Poll for completion (timeout after 30 seconds)
    timeout = 30
    start_time = time.time()
    result_data = None
    error_msg = None
    
    while time.time() - start_time < timeout:
        with get_db() as db:
            job_row = db.execute(
                text("SELECT status, output, error FROM jobs WHERE id = :id"),
                {"id": job_id}
            ).fetchone()
            
            if job_row:
                status = job_row[0]
                output = job_row[1]
                error = job_row[2]
                
                if status == "completed":
                    result_data = output if isinstance(output, dict) else json.loads(output or "{}")
                    break
                elif status == "failed":
                    error_msg = error or "Unknown error"
                    break
                    
        # Keep typing indicator alive if it's been more than 4 seconds
        if int(time.time() - start_time) % 5 == 0:
            try:
                await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")
            except:
                pass
            
        time.sleep(1)

    # Process results
    if result_data:
        response_text = result_data.get("response_text", "Sorry, I generated an empty response.")
        audio_path = result_data.get("audio_path")
        
        # Save assistant message to DB
        with get_db() as db:
            db.execute(
                text("INSERT INTO messages (conversation_id, role, content, audio_url) VALUES (:cid, 'assistant', :content, :audio)"),
                {"cid": conv_id, "content": response_text, "audio": audio_path}
            )

        # Send response
        if audio_path and Path(audio_path).exists():
            with open(audio_path, "rb") as audio:
                await update.message.reply_voice(voice=audio, caption=response_text)
        else:
            await update.message.reply_text(response_text)
            
    elif error_msg:
        logger.error(f"Chat job failed: {error_msg}")
        await update.message.reply_text("I'm sorry, I ran into an issue while generating my response.")
    else:
        logger.error("Chat job timed out")
        await update.message.reply_text("I'm sorry, it took too long to generate a response. Please try again.")

def main():
    """Start the Telegram bot."""
    if not settings.telegram_bot_token:
        logger.error("TELEGRAM_BOT_TOKEN is not set. Exiting.")
        return
        
    app = Application.builder().token(settings.telegram_bot_token).build()
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    logger.info("Telegram bot started - Waiting for messages...")
    app.run_polling()

if __name__ == "__main__":
    main()