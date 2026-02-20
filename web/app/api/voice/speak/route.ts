import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const { text, voice_id } = body;

    if (!text) {
      return NextResponse.json({ error: "text required" }, { status: 400 });
    }

    let voiceId = voice_id;
    if (!voiceId) {
      const persona = await query(`SELECT voice_id FROM personas WHERE user_id = $1 LIMIT 1`, [user.id]);
      voiceId = persona.rows[0]?.voice_id;
    }

    if (!voiceId) {
      return NextResponse.json({ error: "No cloned voice found" }, { status: 400 });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ELEVENLABS_API_KEY not configured" }, { status: 500 });
    }

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json({ error: `ElevenLabs error: ${errText}` }, { status: 500 });
    }

    const audio = await response.arrayBuffer();
    return new NextResponse(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Error generating speech:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
