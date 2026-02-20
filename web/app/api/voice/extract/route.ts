import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { query } from "@/lib/db";
import { pushJob } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const { youtube_url, persona_name } = body;

    if (!youtube_url || !persona_name) {
      return NextResponse.json({ error: "youtube_url and persona_name required" }, { status: 400 });
    }

    const jobResult = await query(
      `INSERT INTO jobs (user_id, type, status, input)
       VALUES ($1, 'voice_extract', 'pending', $2)
       RETURNING id`,
      [user.id, JSON.stringify({ youtube_url, persona_name })]
    );

    const jobId = jobResult.rows[0].id;
    await pushJob("voice_clone", jobId);

    return NextResponse.json({
      job_id: jobId,
      status: "queued",
      message: "Audio extraction queued",
    });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Error creating extract job:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
