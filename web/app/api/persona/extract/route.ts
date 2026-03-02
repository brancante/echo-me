import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { query } from "@/lib/db";
import { pushJob } from "@/lib/redis";

export const dynamic = "force-dynamic";

const PERSONA_QUEUE = process.env.PERSONA_QUEUE_NAME || "queue:persona_extract";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json().catch(() => ({}));
    const { personaId } = body as { personaId?: string };

    if (!personaId) {
      return NextResponse.json({ error: "personaId is required" }, { status: 400 });
    }

    const personaCheck = await query(
      `SELECT id FROM personas WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [personaId, user.id]
    );

    if (personaCheck.rows.length === 0) {
      return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    }

    const insert = await query(
      `INSERT INTO jobs (user_id, type, status, input)
       VALUES ($1, 'persona_extract', 'pending', $2::jsonb)
       RETURNING id, status, created_at`,
      [user.id, JSON.stringify({ persona_id: personaId })]
    );

    const job = insert.rows[0];
    await pushJob(PERSONA_QUEUE, job.id);

    return NextResponse.json({
      ok: true,
      job,
      queue: PERSONA_QUEUE,
      message: "Persona extraction job queued",
    });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Error creating persona extraction job:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
