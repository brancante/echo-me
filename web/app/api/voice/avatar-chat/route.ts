import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const text = String(body?.text || "").trim();

    if (!text) {
      return NextResponse.json({ error: "text required" }, { status: 400 });
    }

    const personaRes = await query(
      `SELECT id, name, voice_id, voice_status
       FROM personas
       WHERE user_id = $1
       ORDER BY updated_at DESC
       LIMIT 1`,
      [user.id]
    );

    if (personaRes.rows.length === 0) {
      return NextResponse.json({ error: "Nenhuma persona encontrada" }, { status: 404 });
    }

    const persona = personaRes.rows[0];

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

    const responseText = `${persona.name || "Avatar"}: ${text}`;

    let videoUrl: string | null = null;
    let audioUrl: string | null = null;
    let note: string | undefined;

    const heygenBaseUrl = (process.env.HEYGEN_BASE_URL || "https://api.heygen.com").replace(/\/$/, "");
    const endpointCandidates = [
      process.env.HEYGEN_CHAT_ENDPOINT,
      `${heygenBaseUrl}/v2/video/generate`,
      `${heygenBaseUrl}/v1/video/generate`,
    ].filter(Boolean) as string[];

    if (heygenApiKey && avatarId) {
      try {
        const payload = JSON.stringify({
          avatar_id: avatarId,
          voice_id: voiceId,
          input_text: responseText,
          test: true,
        });

        const postWith = async (endpoint: string, headers: Record<string, string>) => {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...headers,
            },
            body: payload,
          });
          const data = await res.json().catch(() => ({}));
          return { res, data, endpoint };
        };

        let heygenRes: Response | null = null;
        let heygenData: any = null;
        let usedEndpoint: string | null = null;

        const authHeaders: Record<string, string>[] = [
          { "X-API-KEY": heygenApiKey },
          { "x-api-key": heygenApiKey },
          { Authorization: `Bearer ${heygenApiKey}` },
        ];

        outer: for (const endpoint of endpointCandidates) {
          for (const headers of authHeaders) {
            const attempt = await postWith(endpoint, headers);
            heygenRes = attempt.res;
            heygenData = attempt.data;
            usedEndpoint = attempt.endpoint;
            if (heygenRes.ok) break outer;
            if (heygenRes.status !== 401 && heygenRes.status !== 404) break;
          }
        }

        if (!heygenRes) {
          throw new Error("Sem resposta da HeyGen");
        }

        if (!heygenRes.ok) {
          const rawErr =
            heygenData?.message ??
            heygenData?.error ??
            heygenData?.detail ??
            heygenData ??
            "sem detalhe";

          const errMsg =
            typeof rawErr === "string" ? rawErr : JSON.stringify(rawErr);

          if (heygenRes.status === 404) {
            note = `HeyGen retornou 404 em ${usedEndpoint}. Verifique se sua conta tem acesso ao endpoint de geração de vídeo API.`;
          } else {
            note = `HeyGen retornou ${heygenRes.status} (${usedEndpoint}): ${errMsg}`;
          }
        } else {
          const data = heygenData?.data || heygenData;
          videoUrl = data?.video_url || data?.video?.url || data?.url || null;
          audioUrl = data?.audio_url || data?.audio?.url || null;
          if (!videoUrl && !audioUrl) {
            note = "HeyGen respondeu sem URL imediata (pode ser assíncrono, verificar endpoint configurado).";
          }
        }
      } catch {
        note = "Falha ao chamar HeyGen; verifique endpoint/chave no ambiente.";
      }
    } else if (!heygenApiKey) {
      note = "HEYGEN_API_KEY não configurada no web app.";
    } else if (!avatarId) {
      note = "Nenhum avatar encontrado. Informe um Avatar ID manualmente em Configurações.";
    }

    // Fallback para contas free: Video Agent (sem avatar fixo)
    if (!videoUrl && heygenApiKey) {
      try {
        const videoAgentEndpoint =
          process.env.HEYGEN_VIDEO_AGENT_ENDPOINT || `${heygenBaseUrl}/v1/video_agent/generate`;

        const payload = JSON.stringify({ prompt: responseText });

        const tryAgent = async (headers: Record<string, string>) => {
          const res = await fetch(videoAgentEndpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...headers,
            },
            body: payload,
          });
          const data = await res.json().catch(() => ({}));
          return { res, data };
        };

        let agent = await tryAgent({ "X-API-KEY": heygenApiKey });
        if (agent.res.status === 401) {
          agent = await tryAgent({ Authorization: `Bearer ${heygenApiKey}` });
        }

        if (agent.res.ok) {
          const data = agent.data?.data || agent.data;
          videoUrl = data?.video_url || data?.video?.url || data?.url || videoUrl;
          audioUrl = data?.audio_url || data?.audio?.url || audioUrl;
          note = videoUrl
            ? "Fallback ativado: vídeo gerado via Video Agent (sem avatar fixo)."
            : "Fallback Video Agent acionado, aguardando URL de vídeo.";
        } else {
          const rawAgentErr = agent.data?.message ?? agent.data?.error ?? agent.data ?? "sem detalhe";
          const agentErr = typeof rawAgentErr === "string" ? rawAgentErr : JSON.stringify(rawAgentErr);
          note = `${note || "Fallback avatar falhou."} Video Agent também falhou (${agent.res.status} em ${videoAgentEndpoint}): ${agentErr}`;
        }
      } catch (e: any) {
        note = `${note || "Fallback avatar falhou."} Video Agent também falhou (erro de rede/exceção).`;
      }
    }

    // Modo demo: garante teste de jornada/canais mesmo sem permissão de API de vídeo
    if (!videoUrl) {
      videoUrl =
        process.env.DEMO_AVATAR_VIDEO_URL ||
        "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";
      note = `${note ? `${note} ` : ""}Modo demo ativo: usando vídeo genérico para validar conceito/jornada.`;
    }

    return NextResponse.json({
      text: responseText,
      avatar_id: avatarId,
      voice_id: voiceId,
      video_url: videoUrl,
      audio_url: audioUrl,
      note,
      demo_mode: true,
    });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Error in avatar chat:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
