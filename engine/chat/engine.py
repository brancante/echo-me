"""
Echo Me Chat Engine

Orchestrates RAG retrieval, persona loading, LLM generation, and optional TTS
to produce personalized responses that sound like the user.

Architecture:
1. Receive user message + context (user_id, product_id, client_id)
2. Query RAG for relevant product knowledge
3. Load user's persona profile (auto + manual overrides)
4. Generate response with LLM (maintaining persona voice)
5. Optionally convert to TTS using cloned voice
6. Return text + optional audio URL
"""

import os
import requests
import logging
from typing import Optional, Dict, Any, List
from openai import OpenAI

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class ChatEngine:
    """Main chat orchestrator for Echo Me"""
    
    def __init__(
        self,
        openai_api_key: Optional[str] = None,
        rag_service_url: str = "http://localhost:8001",
        elevenlabs_api_key: Optional[str] = None
    ):
        self.openai_client = OpenAI(api_key=openai_api_key or os.getenv("OPENAI_API_KEY"))
        self.rag_service_url = rag_service_url
        self.elevenlabs_api_key = elevenlabs_api_key or os.getenv("ELEVENLABS_API_KEY")
        
    def query_rag(
        self,
        user_id: int,
        query: str,
        product_id: Optional[int] = None,
        top_k: int = 5
    ) -> List[Dict[str, Any]]:
        """Query RAG system for relevant product knowledge"""
        try:
            params = {
                "user_id": user_id,
                "query": query,
                "top_k": top_k
            }
            if product_id:
                params["product_id"] = product_id
                
            response = requests.post(
                f"{self.rag_service_url}/query",
                json=params,
                timeout=10
            )
            response.raise_for_status()
            
            data = response.json()
            logger.info(f"RAG returned {len(data.get('results', []))} results")
            return data.get("results", [])
            
        except Exception as e:
            logger.error(f"RAG query failed: {e}")
            return []
    
    def load_persona(self, db_conn, user_id: int) -> Dict[str, Any]:
        """Load user's persona profile from database"""
        try:
            cursor = db_conn.cursor()
            cursor.execute("""
                SELECT 
                    name, voice_id, voice_status,
                    auto_profile, manual_profile
                FROM personas
                WHERE user_id = %s
                LIMIT 1
            """, (user_id,))
            
            row = cursor.fetchone()
            if not row:
                logger.warning(f"No persona found for user {user_id}")
                return {}
            
            return {
                "name": row[0],
                "voice_id": row[1],
                "voice_status": row[2],
                "auto_profile": row[3] or {},
                "manual_profile": row[4] or {}
            }
        except Exception as e:
            logger.error(f"Failed to load persona: {e}")
            return {}
    
    def build_system_prompt(
        self,
        persona: Dict[str, Any],
        rag_context: List[Dict[str, Any]]
    ) -> str:
        """Build system prompt combining persona and RAG context"""
        
        # Extract persona traits
        auto = persona.get("auto_profile", {})
        manual = persona.get("manual_profile", {})
        
        # Merge profiles (manual overrides auto)
        tone = manual.get("tone") or auto.get("tone", "professional")
        vocabulary = manual.get("vocabulary_level") or auto.get("vocabulary_level", "intermediate")
        patterns = manual.get("speech_patterns") or auto.get("speech_patterns", [])
        approach = manual.get("selling_approach") or auto.get("selling_approach", "consultative")
        dos = manual.get("dos") or auto.get("dos", [])
        donts = manual.get("donts") or auto.get("donts", [])
        
        # Build context from RAG
        context_text = "\n".join([
            f"- {item.get('text', '')}" 
            for item in rag_context[:5]  # Top 5 results
        ])
        
        prompt = f"""You are a sales assistant representing {persona.get('name', 'the user')}.

PERSONALITY PROFILE:
- Tone: {tone}
- Vocabulary Level: {vocabulary}
- Selling Approach: {approach}

"""
        
        if patterns:
            prompt += f"SPEECH PATTERNS:\n"
            for pattern in patterns[:3]:
                prompt += f"- {pattern}\n"
            prompt += "\n"
        
        if dos:
            prompt += f"ALWAYS:\n"
            for do in dos[:3]:
                prompt += f"- {do}\n"
            prompt += "\n"
        
        if donts:
            prompt += f"NEVER:\n"
            for dont in donts[:3]:
                prompt += f"- {dont}\n"
            prompt += "\n"
        
        if context_text:
            prompt += f"""PRODUCT KNOWLEDGE:
{context_text}

"""
        
        prompt += """Your task: Answer the customer's question in YOUR voice (matching the personality above).
Be helpful, authentic, and maintain your unique communication style.
Use the product knowledge provided when relevant."""
        
        return prompt
    
    def generate_response(
        self,
        message: str,
        system_prompt: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        model: str = "gpt-4o-mini"
    ) -> str:
        """Generate response using OpenAI with persona + context"""
        
        messages = [{"role": "system", "content": system_prompt}]
        
        # Add conversation history if provided
        if conversation_history:
            messages.extend(conversation_history[-10:])  # Last 10 messages
        
        # Add current message
        messages.append({"role": "user", "content": message})
        
        try:
            response = self.openai_client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.7,
                max_tokens=500
            )
            
            text = response.choices[0].message.content
            logger.info(f"Generated response: {len(text)} chars")
            return text
            
        except Exception as e:
            logger.error(f"LLM generation failed: {e}")
            return "I apologize, I'm having trouble responding right now. Please try again."
    
    def text_to_speech(
        self,
        text: str,
        voice_id: str,
        output_path: Optional[str] = None
    ) -> Optional[str]:
        """Convert text to speech using ElevenLabs"""
        
        if not self.elevenlabs_api_key:
            logger.warning("No ElevenLabs API key, skipping TTS")
            return None
        
        try:
            url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
            headers = {
                "xi-api-key": self.elevenlabs_api_key,
                "Content-Type": "application/json"
            }
            data = {
                "text": text,
                "model_id": "eleven_monolingual_v1",
                "voice_settings": {
                    "stability": 0.5,
                    "similarity_boost": 0.75
                }
            }
            
            response = requests.post(url, headers=headers, json=data, timeout=30)
            response.raise_for_status()
            
            # Save to file if path provided
            if output_path:
                with open(output_path, 'wb') as f:
                    f.write(response.content)
                logger.info(f"TTS saved to {output_path}")
                return output_path
            
            # Otherwise return raw bytes
            return response.content
            
        except Exception as e:
            logger.error(f"TTS generation failed: {e}")
            return None
    
    def chat(
        self,
        db_conn,
        user_id: int,
        message: str,
        product_id: Optional[int] = None,
        client_id: Optional[int] = None,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        generate_audio: bool = False
    ) -> Dict[str, Any]:
        """
        Main chat method - orchestrates full pipeline
        
        Returns:
        {
            "text": "Generated response",
            "audio_path": "/path/to/audio.mp3" (if generate_audio=True),
            "rag_context": [...],
            "persona": {...}
        }
        """
        
        logger.info(f"Chat request: user={user_id}, product={product_id}, audio={generate_audio}")
        
        # 1. Query RAG for context
        rag_results = self.query_rag(user_id, message, product_id)
        
        # 2. Load persona
        persona = self.load_persona(db_conn, user_id)
        
        # 3. Build system prompt
        system_prompt = self.build_system_prompt(persona, rag_results)
        
        # 4. Generate response
        response_text = self.generate_response(
            message,
            system_prompt,
            conversation_history
        )
        
        # 5. Optional TTS
        audio_path = None
        if generate_audio and persona.get("voice_id"):
            audio_path = self.text_to_speech(
                response_text,
                persona["voice_id"],
                output_path=f"/tmp/chat_{user_id}_{client_id or 'temp'}.mp3"
            )
        
        return {
            "text": response_text,
            "audio_path": audio_path,
            "rag_context": rag_results,
            "persona": persona
        }


if __name__ == "__main__":
    # Quick test
    import psycopg2
    
    db_conn = psycopg2.connect(os.getenv("DATABASE_URL"))
    engine = ChatEngine()
    
    result = engine.chat(
        db_conn=db_conn,
        user_id=1,
        message="What products do you have for small businesses?",
        generate_audio=False
    )
    
    print(f"Response: {result['text']}")
    print(f"RAG Context: {len(result['rag_context'])} items")
    print(f"Persona: {result['persona'].get('name')}")
