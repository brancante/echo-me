"""
RAG Query Service - FastAPI server for semantic search.

This service provides an HTTP endpoint for querying the RAG system.
It generates embeddings for queries and searches ChromaDB for relevant chunks.
"""

import logging
from typing import List, Optional

import chromadb
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel

from config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [rag-query] %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Echo Me RAG Query Service", version="1.0.0")

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class QueryRequest(BaseModel):
    """Request model for RAG queries."""
    user_id: str
    query: str
    top_k: int = 5
    min_score: Optional[float] = 0.3


class QueryResponse(BaseModel):
    """Response model with retrieved documents."""
    documents: List[str]
    metadatas: List[dict]
    distances: List[float]
    ids: List[str]


def get_chroma_client():
    """Initialize ChromaDB HTTP client."""
    return chromadb.HttpClient(host=settings.chroma_host, port=settings.chroma_port)


def generate_query_embedding(query: str) -> List[float]:
    """Generate embedding for a search query using OpenAI."""
    if not settings.openai_api_key:
        raise ValueError("OPENAI_API_KEY not configured")
    
    client = OpenAI(api_key=settings.openai_api_key)
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=query
    )
    return response.data[0].embedding


@app.post("/query", response_model=QueryResponse)
async def query_products(request: QueryRequest):
    """
    Query the RAG system for relevant product knowledge.
    
    This endpoint:
    1. Generates an embedding for the query
    2. Searches the user's ChromaDB collection
    3. Returns the top-k most relevant chunks
    """
    try:
        logger.info(f"Query from user {request.user_id}: '{request.query}'")
        
        # Generate query embedding
        query_embedding = generate_query_embedding(request.query)
        
        # Search ChromaDB
        chroma = get_chroma_client()
        collection_name = f"product_embeddings_{request.user_id}"
        
        try:
            collection = chroma.get_collection(collection_name)
        except Exception:
            # Collection doesn't exist yet - user hasn't uploaded anything
            logger.warning(f"Collection {collection_name} not found")
            return QueryResponse(
                documents=[],
                metadatas=[],
                distances=[],
                ids=[]
            )
        
        # Perform semantic search
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=request.top_k
        )
        
        # Filter by minimum score if specified
        # ChromaDB returns distances (lower is better), convert to similarity
        documents = []
        metadatas = []
        distances = []
        ids = []
        
        if results["documents"] and len(results["documents"]) > 0:
            for i, (doc, meta, dist, doc_id) in enumerate(zip(
                results["documents"][0],
                results["metadatas"][0],
                results["distances"][0],
                results["ids"][0]
            )):
                # Convert distance to similarity score (1 - normalized distance)
                # For cosine distance, similarity = 1 - distance
                similarity = 1 - dist
                
                if request.min_score is None or similarity >= request.min_score:
                    documents.append(doc)
                    metadatas.append(meta)
                    distances.append(dist)
                    ids.append(doc_id)
        
        logger.info(f"Found {len(documents)} results (filtered by min_score={request.min_score})")
        
        return QueryResponse(
            documents=documents,
            metadatas=metadatas,
            distances=distances,
            ids=ids
        )
        
    except Exception as e:
        logger.error(f"Query failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    try:
        # Verify ChromaDB is reachable
        chroma = get_chroma_client()
        chroma.heartbeat()
        
        return {
            "status": "healthy",
            "chroma": "connected",
            "openai_configured": bool(settings.openai_api_key)
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e)
        }


if __name__ == "__main__":
    import uvicorn
    
    logger.info("🚀 Starting RAG Query Service on port 8001")
    uvicorn.run(app, host="0.0.0.0", port=8001, log_level="info")
