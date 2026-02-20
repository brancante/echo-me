import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import { requireAuth } from "@/lib/session";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const user = await requireAuth();
    const result = await query(
      `SELECT output, status, type FROM jobs WHERE id = $1 AND user_id = $2`,
      [params.jobId, user.id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const job = result.rows[0];
    if (job.status !== "completed" || job.type !== "voice_extract") {
      return NextResponse.json({ error: "Audio not ready" }, { status: 400 });
    }

    const output = typeof job.output === "string" ? JSON.parse(job.output) : job.output;
    const audioPath = output?.audio_path;
    if (!audioPath) {
      return NextResponse.json({ error: "Audio path missing" }, { status: 404 });
    }

    const buffer = await fs.readFile(audioPath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Error serving audio:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
