import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

function safeJsonParse(value: unknown): any {
  if (!value) return {};
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return {};
}

async function fetchHeygenExistingAvatar(heygenApiKey: string): Promise<string | null> {
  if (!heygenApiKey) return null;

  const baseUrl = (process.env.HEYGEN_BASE_URL || "https://api.heygen.com").replace(/\/$/, "");
  const endpoint = process.env.HEYGEN_AVATAR_LIST_ENDPOINT || `${baseUrl}/v2/avatars`;

  async function tryFetch(headers: Record<string, string>) {
    const res = await fetch(endpoint, { headers, cache: "no-store" });
    if (!res.ok) return null;
    const payload = await res.json().catch(() => ({}));
    const data = payload?.data || payload;
    const list = Array.isArray(data) ? data : Array.isArray(data?.avatars) ? data.avatars : [];
    const first = list[0];
    return first?.avatar_id || first?.id || first?.digital_twin_id || null;
  }

  try {
    return (
      (await tryFetch({ "X-API-KEY": heygenApiKey })) ||
      (await tryFetch({ Authorization: `Bearer ${heygenApiKey}` }))
    );
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const user = await requireAuth();

    const personaRes = await query(
      `SELECT id, name, voice_id, voice_status
       FROM personas
       WHERE user_id = $1
       ORDER BY updated_at DESC
       LIMIT 1`,
      [user.id]
    );

    const persona = personaRes.rows[0] || null;

    const latestJobRes = await query(
      `SELECT output
       FROM jobs
       WHERE user_id = $1 AND type = 'heygen_train' AND status = 'completed'
       ORDER BY created_at DESC
       LIMIT 1`,
      [user.id]
    );

    const latestOutput = safeJsonParse(latestJobRes.rows[0]?.output);

    const [keyRes, manualAvatarRes] = await Promise.all([
      query(
        `SELECT encrypted_key
         FROM api_keys
         WHERE user_id = $1 AND provider = 'heygen'
         ORDER BY created_at DESC
         LIMIT 1`,
        [user.id]
      ),
      query(
        `SELECT encrypted_key
         FROM api_keys
         WHERE user_id = $1 AND provider = 'heygen_avatar'
         ORDER BY created_at DESC
         LIMIT 1`,
        [user.id]
      ),
    ]);

    const heygenApiKey =
      String(keyRes.rows[0]?.encrypted_key || "")
        .trim()
        .replace(/^Bearer\s+/i, "") ||
      String(process.env.HEYGEN_API_KEY || "")
        .trim()
        .replace(/^Bearer\s+/i, "") ||
      "";
    const manualAvatarId = String(manualAvatarRes.rows[0]?.encrypted_key || "").trim() || null;

    const jobAvatarId = latestOutput?.avatar_id || latestOutput?.digital_twin_id || null;
    const existingAvatarId = await fetchHeygenExistingAvatar(heygenApiKey);

    const avatarId = manualAvatarId || jobAvatarId || existingAvatarId;
    const voiceId = persona?.voice_id || latestOutput?.voice_id || null;

    const ready = Boolean(avatarId);

    return NextResponse.json({
      ready,
      voice_status: persona?.voice_status || "pending",
      voice_id: voiceId,
      avatar_id: avatarId,
      reason: ready ? null : "Nenhum avatar encontrado. Você pode treinar, usar uma chave que já tenha avatar, ou informar o Avatar ID manualmente em Configurações.",
    });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Error checking model status:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
