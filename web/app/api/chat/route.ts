import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { query } from "@/lib/db";
import { pushToQueue } from "@/lib/redis";

/**
 * POST /api/chat
 * Create a chat job and enqueue for processing
 */
export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { message, product_id, client_id, generate_audio, conversation_history } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO jobs (user_id, type, status, input)
       VALUES ($1, 'chat', 'pending', $2)
       RETURNING id`,
      [
        user.id,
        JSON.stringify({
          message,
          product_id,
          client_id,
          generate_audio: generate_audio || false,
          conversation_history: conversation_history || [],
        }),
      ]
    );

    const jobId = result.rows[0].id;

    await pushToQueue("queue:chat", {
      job_id: jobId,
      user_id: user.id,
      message,
      product_id,
      client_id,
      generate_audio: generate_audio || false,
      conversation_history: conversation_history || [],
    });

    return NextResponse.json({ job_id: jobId });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json({ error: "Failed to create chat job" }, { status: 500 });
  }
}
