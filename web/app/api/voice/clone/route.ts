import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { youtube_url, persona_name } = body;

  if (!youtube_url || !persona_name) {
    return NextResponse.json({ error: "youtube_url and persona_name required" }, { status: 400 });
  }

  // TODO: push job to Redis queue for voice worker
  const jobId = `job_${Date.now()}`;

  return NextResponse.json({
    job_id: jobId,
    status: "queued",
    message: `Voice clone job queued for "${persona_name}"`,
  });
}
