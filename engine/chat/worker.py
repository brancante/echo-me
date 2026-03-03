"""
Echo Me Chat Worker

Processes chat requests from Redis queue `queue:chat`.

Job format:
{
    "job_id": 123,
    "user_id": 1,
    "message": "What products do you have?",
    "product_id": 5 (optional),
    "client_id": 10 (optional),
    "generate_audio": false
}
"""

import os
import sys
import json
import time
import logging
import psycopg2
import redis
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from chat.engine import ChatEngine

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class ChatWorker:
    """Worker that processes chat jobs from Redis queue"""
    
    def __init__(self):
        self.db_conn = psycopg2.connect(os.getenv("DATABASE_URL"))
        self.redis_client = redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379"))
        self.engine = ChatEngine()
        
    def update_job_status(
        self,
        job_id: str,
        status: str,
        result_data: dict = None,
        error_message: str = None
    ):
        """Update job status in database"""
        try:
            cursor = self.db_conn.cursor()
            
            if status == "processing":
                cursor.execute("""
                    UPDATE jobs
                    SET status = %s,
                        started_at = NOW()
                    WHERE id = %s
                """, (status, job_id))
            elif status == "completed":
                cursor.execute("""
                    UPDATE jobs
                    SET status = %s,
                        output = %s,
                        completed_at = NOW()
                    WHERE id = %s
                """, (status, json.dumps(result_data), job_id))
            elif status == "failed":
                cursor.execute("""
                    UPDATE jobs
                    SET status = %s,
                        error = %s,
                        completed_at = NOW()
                    WHERE id = %s
                """, (status, error_message, job_id))
            else:
                cursor.execute("""
                    UPDATE jobs
                    SET status = %s
                    WHERE id = %s
                """, (status, job_id))
            
            self.db_conn.commit()
            logger.info(f"Job {job_id} status updated to {status}")
            
        except Exception as e:
            logger.error(f"Failed to update job status: {e}")
            self.db_conn.rollback()
    
    def process_job(self, job_data: dict):
        """Process a single chat job"""
        job_id = job_data.get("job_id")
        user_id = job_data.get("user_id")
        message = job_data.get("message")
        
        logger.info(f"Processing chat job {job_id} for user {user_id}")
        
        try:
            # Update to processing
            self.update_job_status(job_id, "processing")
            
            # Run chat engine
            result = self.engine.chat(
                db_conn=self.db_conn,
                user_id=user_id,
                message=message,
                product_id=job_data.get("product_id"),
                client_id=job_data.get("client_id"),
                conversation_history=job_data.get("conversation_history"),
                generate_audio=job_data.get("generate_audio", False)
            )
            
            # Update to completed
            self.update_job_status(
                job_id,
                "completed",
                result_data={
                    "response_text": result["text"],
                    "audio_path": result.get("audio_path"),
                    "rag_context_count": len(result.get("rag_context", [])),
                    "persona_name": result.get("persona", {}).get("name")
                }
            )
            
            logger.info(f"Job {job_id} completed successfully")
            
        except Exception as e:
            logger.error(f"Job {job_id} failed: {e}")
            self.update_job_status(job_id, "failed", error_message=str(e))
    
    def run(self):
        """Main worker loop"""
        logger.info("Chat worker started")
        logger.info("Waiting for jobs on queue:chat...")
        
        while True:
            try:
                # Block until job available (5 second timeout)
                result = self.redis_client.blpop("queue:chat", timeout=5)
                
                if result:
                    _, job_json = result
                    job_data = json.loads(job_json)
                    self.process_job(job_data)
                
            except KeyboardInterrupt:
                logger.info("Worker stopped by user")
                break
            except Exception as e:
                logger.error(f"Worker error: {e}")
                time.sleep(5)  # Wait before retrying


if __name__ == "__main__":
    worker = ChatWorker()
    worker.run()
