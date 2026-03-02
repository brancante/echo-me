import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  try {
    await requireAuth();

    return NextResponse.json(
      {
        error:
          "Endpoint desativado. O pipeline agora usa HeyGen para avatar+voz; não há TTS ElevenLabs nesta rota.",
      },
      { status: 410 }
    );
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
