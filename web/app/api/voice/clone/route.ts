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

    // Create or get existing persona for this user (one persona per user for MVP)
    let personaId: string;
    
    const existingPersona = await query(
      `SELECT id FROM personas WHERE user_id = $1 LIMIT 1`,
      [user.id]
    );
    
    if (existingPersona.rows.length > 0) {
      // Update existing persona
      personaId = existingPersona.rows[0].id;
      await query(
        `UPDATE personas SET name = $1, youtube_url = $2, voice_status = 'pending', updated_at = NOW()
         WHERE id = $3`,
        [persona_name, youtube_url, personaId]
      );
    } else {
      // Create new persona
      const newPersona = await query(
        `INSERT INTO personas (user_id, name, youtube_url, voice_status)
         VALUES ($1, $2, $3, 'pending')
         RETURNING id`,
        [user.id, persona_name, youtube_url]
      );
      personaId = newPersona.rows[0].id;
    }
    
    const finalPersonaId = personaId;

    // Create voice clone job
    const jobResult = await query(
      `INSERT INTO jobs (user_id, type, status, input)
       VALUES ($1, 'voice_clone', 'pending', $2)
       RETURNING id`,
      [user.id, JSON.stringify({ youtube_url, persona_name, persona_id: finalPersonaId })]
    );
    
    const jobId = jobResult.rows[0].id;
    
    // Push to Redis queue
    await pushJob("voice_clone", jobId);

    return NextResponse.json({
      job_id: jobId,
      status: "queued",
      message: `Voice clone job queued for "${persona_name}"`,
    });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Error creating voice clone job:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
