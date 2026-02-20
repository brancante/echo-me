"""LLM chain — combines persona context + RAG results to generate responses."""

import json
import logging
from typing import Optional

import chromadb
from openai import OpenAI

from config import settings

logger = logging.getLogger(__name__)


def build_system_prompt(persona: dict) -> str:
    """Build system prompt from persona profile."""
    profile = persona.get("auto_profile", {})
    overrides = persona.get("manual_overrides", {})
    # Manual overrides take precedence
    merged = {**profile, **overrides}

    name = merged.get("name", persona.get("name", "Assistant"))
    tone = merged.get("tone", "professional")
    patterns = ", ".join(merged.get("speech_patterns", []))
    traits = ", ".join(merged.get("personality_traits", []))
    dos = ", ".join(merged.get("dos", []))
    donts = ", ".join(merged.get("donts", []))
    style = merged.get("communication_style", "")

    return f"""You are {name}. You are responding to a customer inquiry.

Personality: {traits}
Tone: {tone}
Speech patterns: {patterns}
Communication style: {style}
Always: {dos}
Never: {donts}

Stay in character. Use the product information provided to answer accurately.
If you don't know something, say so naturally — don't make things up."""


def query_rag(user_id: str, question: str, top_k: int = 5) -> list[str]:
    """Query ChromaDB for relevant product chunks."""
    client = OpenAI(api_key=settings.openai_api_key)
    embedding = client.embeddings.create(
        model="text-embedding-3-small", input=[question]
    ).data[0].embedding

    chroma = chromadb.HttpClient(host=settings.chroma_host, port=settings.chroma_port)
    try:
        collection = chroma.get_collection(f"product_embeddings_{user_id}")
    except Exception:
        return []

    results = collection.query(query_embeddings=[embedding], n_results=top_k)
    return results["documents"][0] if results["documents"] else []


def generate_response(
    persona: dict,
    user_id: str,
    question: str,
    client_name: Optional[str] = None,
    client_notes: Optional[str] = None,
) -> str:
    """Generate a persona-aware, RAG-enhanced response."""
    system_prompt = build_system_prompt(persona)
    rag_context = query_rag(user_id, question)

    context_block = ""
    if rag_context:
        context_block = "Product information:\n" + "\n".join(
            f"- {chunk}" for chunk in rag_context
        )

    client_block = ""
    if client_name:
        client_block = f"\nClient: {client_name}"
        if client_notes:
            client_block += f" ({client_notes})"

    user_prompt = f"""{context_block}
{client_block}

Customer question: {question}

Respond naturally as {persona.get('name', 'the persona')} would."""

    client = OpenAI(api_key=settings.openai_api_key)
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.7,
        max_tokens=500,
    )
    return response.choices[0].message.content
