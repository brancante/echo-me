import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

function normalizeHeygenKey(key: string) {
  return key.trim().replace(/^Bearer\s+/i, "");
}

function maskKey(key: string) {
  if (!key) return "";
  if (key.length <= 8) return "*".repeat(key.length);
  return `${key.slice(0, 4)}${"*".repeat(Math.max(4, key.length - 8))}${key.slice(-4)}`;
}

export async function GET() {
  try {
    const user = await requireAuth();

    const result = await query(
      `SELECT encrypted_key
       FROM api_keys
       WHERE user_id = $1 AND provider = 'heygen'
       ORDER BY created_at DESC
       LIMIT 1`,
      [user.id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ configured: false, masked: null });
    }

    const key = String(result.rows[0].encrypted_key || "");
    return NextResponse.json({ configured: Boolean(key), masked: maskKey(key) });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Error reading HeyGen key:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const key = normalizeHeygenKey(String(body?.key || ""));

    if (!key) {
      return NextResponse.json({ error: "key required" }, { status: 400 });
    }

    await query(
      `DELETE FROM api_keys
       WHERE user_id = $1 AND provider = 'heygen'`,
      [user.id]
    );

    await query(
      `INSERT INTO api_keys (user_id, provider, encrypted_key)
       VALUES ($1, 'heygen', $2)`,
      [user.id, key]
    );

    return NextResponse.json({ ok: true, masked: maskKey(key) });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Error saving HeyGen key:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
