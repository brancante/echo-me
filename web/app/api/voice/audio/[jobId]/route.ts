import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params: _params }: { params: { jobId: string } }
) {
  try {
    await requireAuth();
    return NextResponse.json(
      {
        error:
          "Endpoint desativado. O pipeline antigo de extração de áudio foi removido na migração para HeyGen.",
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
