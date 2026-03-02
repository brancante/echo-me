import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireAuth();

    const result = await query(
      `SELECT encrypted_key
       FROM api_keys
       WHERE user_id = $1 AND provider = 'heygen_avatar'
       ORDER BY created_at DESC
       LIMIT 1`,
      [user.id]
    );

    const avatarId = String(result.rows[0]?.encrypted_key || "").trim() || null;
    return NextResponse.json({ avatar_id: avatarId });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const avatarId = String(body?.avatar_id || "").trim();

    await query(
      `DELETE FROM api_keys
       WHERE user_id = $1 AND provider = 'heygen_avatar'`,
      [user.id]
    );

    if (avatarId) {
      await query(
        `INSERT INTO api_keys (user_id, provider, encrypted_key)
         VALUES ($1, 'heygen_avatar', $2)`,
        [user.id, avatarId]
      );
    }

    return NextResponse.json({ ok: true, avatar_id: avatarId || null });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
