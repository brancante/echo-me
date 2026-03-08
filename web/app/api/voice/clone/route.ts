import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { query } from "@/lib/db";
import { pushJob } from "@/lib/redis";
import { mkdir, writeFile } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();

    const contentType = req.headers.get("content-type") || "";

    let persona_name = "";
    let youtube_url: string | null = null;
    let uploaded_video_path: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      persona_name = String(formData.get("persona_name") || "").trim();
      youtube_url = String(formData.get("youtube_url") || "").trim() || null;

      const file = formData.get("video_file");
      if (file && file instanceof File && file.size > 0) {
        const bytes = Buffer.from(await file.arrayBuffer());
        const safeExt = (file.name.split(".").pop() || "mp4").toLowerCase();
        const filename = `${randomUUID()}.${safeExt}`;

        const uploadDir = path.join("/data", "uploads", String(user.id));
        await mkdir(uploadDir, { recursive: true });

        const absolutePath = path.join(uploadDir, filename);
        await writeFile(absolutePath, bytes);
        uploaded_video_path = absolutePath;
      }
    } else {
      const body = await req.json();
      persona_name = String(body?.persona_name || "").trim();
      youtube_url = String(body?.youtube_url || "").trim() || null;
      uploaded_video_path = String(body?.uploaded_video_path || "").trim() || null;
    }

    if (!persona_name) {
      return NextResponse.json({ error: "persona_name required" }, { status: 400 });
    }

    if (!youtube_url && !uploaded_video_path) {
      return NextResponse.json(
        { error: "youtube_url or video_file required" },
        { status: 400 }
      );
    }

    let personaId: string;

    const existingPersona = await query(
      `SELECT id FROM personas WHERE user_id = $1 LIMIT 1`,
      [user.id]
    );

    if (existingPersona.rows.length > 0) {
      personaId = existingPersona.rows[0].id;
      await query(
        `UPDATE personas
         SET name = $1,
             youtube_url = $2,
             voice_status = 'pending',
             updated_at = NOW()
         WHERE id = $3`,
        [persona_name, youtube_url, personaId]
      );
    } else {
      const newPersona = await query(
        `INSERT INTO personas (user_id, name, youtube_url, voice_status)
         VALUES ($1, $2, $3, 'pending')
         RETURNING id`,
        [user.id, persona_name, youtube_url]
      );
      personaId = newPersona.rows[0].id;
    }

    const keyRes = await query(
      `SELECT encrypted_key
       FROM api_keys
       WHERE user_id = $1 AND provider = 'heygen'
       ORDER BY created_at DESC
       LIMIT 1`,
      [user.id]
    );

    const effectiveHeygenKey = String(keyRes.rows[0]?.encrypted_key || "").trim() || process.env.HEYGEN_API_KEY;
    if (!effectiveHeygenKey) {
      return NextResponse.json(
        { error: "Configure sua HeyGen API key em Settings antes de treinar." },
        { status: 400 }
      );
    }

    const source_type = uploaded_video_path ? "upload" : "youtube";

    const jobInput = {
      persona_id: personaId,
      persona_name,
      source_type,
      youtube_url,
      uploaded_video_path,
      provider: "heygen",
    };

    const jobResult = await query(
      `INSERT INTO jobs (user_id, type, status, input)
       VALUES ($1, 'heygen_train', 'pending', $2)
       RETURNING id`,
      [user.id, JSON.stringify(jobInput)]
    );

    const jobId = jobResult.rows[0].id;
    await pushJob("voice_clone", jobId);

    return NextResponse.json({
      job_id: jobId,
      status: "queued",
      message: `HeyGen training job queued for "${persona_name}"`,
    });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Error creating HeyGen train job:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
