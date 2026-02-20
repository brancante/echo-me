import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const update = await req.json();
  
  // TODO: extract message, identify client, query RAG, generate response, send voice
  console.log("Telegram update:", JSON.stringify(update).slice(0, 200));

  return NextResponse.json({ ok: true });
}
