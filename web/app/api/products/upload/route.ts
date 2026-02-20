import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  // TODO: parse multipart, store file, push to RAG ingest queue
  return NextResponse.json({ status: "queued", message: "Product upload queued for processing" });
}
