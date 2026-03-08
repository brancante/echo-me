"use client";

import { useEffect, useState } from "react";

const API_PREFIX = "/echome/api";

export default function SettingsPage() {
  const [botToken, setBotToken] = useState("");

  const [heygenKey, setHeygenKey] = useState("");
  const [heygenMasked, setHeygenMasked] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState(true);
  const [savingKey, setSavingKey] = useState(false);
  const [keyMsg, setKeyMsg] = useState<string | null>(null);

  const [avatarId, setAvatarId] = useState("");
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [resKey, resAvatar] = await Promise.all([
          fetch(`${API_PREFIX}/settings/heygen-key`),
          fetch(`${API_PREFIX}/settings/heygen-avatar`),
        ]);

        const dataKey = await resKey.json();
        const dataAvatar = await resAvatar.json();

        if (!mounted) return;
        setHeygenMasked(dataKey?.masked || null);
        setAvatarId(dataAvatar?.avatar_id || "");
      } catch {
        if (!mounted) return;
        setKeyMsg("Não foi possível carregar a chave HeyGen atual.");
      } finally {
        if (mounted) setLoadingKey(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  async function saveHeygenKey() {
    if (!heygenKey.trim()) return;
    setSavingKey(true);
    setKeyMsg(null);

    try {
      const res = await fetch(`${API_PREFIX}/settings/heygen-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: heygenKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setKeyMsg(data?.error || "Falha ao salvar chave HeyGen");
        return;
      }

      setHeygenMasked(data?.masked || null);
      setHeygenKey("");
      setKeyMsg("Chave HeyGen salva com sucesso.");
    } catch {
      setKeyMsg("Erro inesperado ao salvar chave HeyGen.");
    } finally {
      setSavingKey(false);
    }
  }

  async function saveAvatarId() {
    setSavingAvatar(true);
    setAvatarMsg(null);

    try {
      const res = await fetch(`${API_PREFIX}/settings/heygen-avatar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar_id: avatarId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAvatarMsg(data?.error || "Falha ao salvar Avatar ID");
        return;
      }

      setAvatarId(data?.avatar_id || "");
      setAvatarMsg("Avatar ID salvo com sucesso.");
    } catch {
      setAvatarMsg("Erro inesperado ao salvar Avatar ID.");
    } finally {
      setSavingAvatar(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">⚙️ Settings</h1>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-gray-500 mb-1">Telegram Bot Token</label>
          <input
            type="password"
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            placeholder="123456:ABC-DEF..."
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
          <p className="text-xs text-gray-600 mt-1">Get this from @BotFather on Telegram</p>
        </div>

        <div>
          <label className="block text-sm text-gray-500 mb-1">Webhook URL</label>
          <input
            disabled
            value="https://your-domain.com/api/webhook/telegram"
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-gray-500"
          />
        </div>

        <button className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-semibold hover:bg-brand-700 transition">
          Save & Set Webhook
        </button>
      </div>

      <hr className="border-gray-800" />

      <div className="space-y-3 rounded-xl border border-gray-800 p-4">
        <h2 className="text-lg font-semibold">HeyGen API (por usuário)</h2>
        <p className="text-sm text-gray-400">
          Cada usuário pode salvar sua própria API key do HeyGen para treino e respostas do avatar.
        </p>

        <input
          type="password"
          value={heygenKey}
          onChange={(e) => setHeygenKey(e.target.value)}
          placeholder="Insira sua HEYGEN_API_KEY (sem 'Bearer ')"
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm focus:border-brand-500 focus:outline-none"
        />

        <button
          onClick={saveHeygenKey}
          disabled={!heygenKey.trim() || savingKey}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {savingKey ? "Salvando..." : "Salvar chave HeyGen"}
        </button>

        {!loadingKey && heygenMasked && (
          <p className="text-xs text-gray-500">Chave atual: {heygenMasked}</p>
        )}

        {keyMsg && <p className="text-xs text-amber-400">{keyMsg}</p>}

        <div className="pt-2 space-y-2">
          <label className="block text-sm text-gray-300">Avatar ID (opcional)</label>
          <input
            value={avatarId}
            onChange={(e) => setAvatarId(e.target.value)}
            placeholder="Ex.: 7f3c1a..."
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
          <p className="text-xs text-gray-500">
            Se sua conta já tiver avatar, informe o ID aqui para habilitar o Teste sem treino.
          </p>
          <button
            onClick={saveAvatarId}
            disabled={savingAvatar}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {savingAvatar ? "Salvando..." : "Salvar Avatar ID"}
          </button>
          {avatarMsg && <p className="text-xs text-amber-400">{avatarMsg}</p>}
        </div>
      </div>

      <hr className="border-gray-800" />

      <div>
        <h2 className="text-lg font-semibold mb-2">API Keys</h2>
        <p className="text-sm text-gray-400 mb-4">Generate API keys for programmatic access.</p>
        <button className="rounded-lg bg-gray-800 px-4 py-2 text-sm hover:bg-gray-700 transition">
          Generate New Key
        </button>
      </div>
    </div>
  );
}
