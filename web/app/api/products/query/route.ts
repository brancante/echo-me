import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * RAG Query Endpoint
 * 
 * Accepts a natural language query and returns the most relevant
 * product knowledge chunks from the user's ChromaDB collection.
 * 
 * This is the retrieval side of the RAG pipeline.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const { query, top_k = 5, min_score = 0.3 } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Query is required and must be a string" },
        { status: 400 }
      );
    }

    // Call the RAG query service (runs in engine)
    const ragServiceUrl = process.env.RAG_SERVICE_URL || "http://localhost:8001";
    
    const response = await fetch(`${ragServiceUrl}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: user.id,
        query,
        top_k,
        min_score,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`RAG service error: ${error}`);
    }

    const results = await response.json();

    return NextResponse.json({
      query,
      results: results.documents || [],
      metadata: results.metadatas || [],
      distances: results.distances || [],
      count: results.documents?.length || 0,
    });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    console.error("Error querying products:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
