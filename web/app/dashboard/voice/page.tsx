"use client";

import { useEffect, useState } from "react";

type JobStatus = "idle" | "loading" | "queued" | "processing" | "completed" | "failed";

export default function VoicePage() {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");

  const [extractJobId, setExtractJobId] = useState<string | null>(null);
  const [extractStatus, setExtractStatus] = useState<JobStatus>("idle");
  const [extractError, setExtractError] = useState<string | null>(null);

  const [cloneJobId, setCloneJobId] = useState<string | null>(null);
  const [cloneStatus, setCloneStatus] = useState<JobStatus>("idle");
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [voiceId, setVoiceId] = useState<string | null>(null);

  const [ttsText, setTtsText] = useState("Olá, eu sou sua nova voz clonada.");
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null);
  const [ttsLoading, setTtsLoading] = useState(false);

  useEffect(() => {
    if (!extractJobId || extractStatus === "completed" || extractStatus === "failed") return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/voice/jobs/${extractJobId}`);
      if (!res.ok) return;
      const data = await res.json();
      const status = data?.job?.status as JobStatus;
      setExtractStatus(status);
      if (status === "failed") setExtractError(data?.job?.error || "Falha na extração");
    }, 3000);
    return () => clearInterval(interval);
  }, [extractJobId, extractStatus]);

  useEffect(() => {
    if (!cloneJobId || cloneStatus === "completed" || cloneStatus === "failed") return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/voice/jobs/${cloneJobId}`);
      if (!res.ok) return;
      const data = await res.json();
      const job = data?.job;
      const status = job?.status as JobStatus;
      setCloneStatus(status);
      if (status === "completed") {
        const output = typeof job.output === "string" ? JSON.parse(job.output) : job.output;
        setVoiceId(output?.voice_id || null);
      }
      if (status === "failed") setCloneError(job?.error || "Falha no clone");
    }, 3000);
    return () => clearInterval(interval);
  }, [cloneJobId, cloneStatus]);

  async function handleExtract() {
    setExtractStatus("loading");
    setExtractError(null);
    setExtractJobId(null);
    setCloneJobId(null);
    setCloneStatus("idle");
    setVoiceId(null);
    setTtsAudioUrl(null);

    const res = await fetch("/api/voice/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ youtube_url: url, persona_name: name }),
    });
    const data = await res.json();
    if (!res.ok) {
      setExtractStatus("failed");
      setExtractError(data.error || "Falha ao iniciar extração");
      return;
    }

    setExtractJobId(data.job_id);
    setExtractStatus("queued");
  }

  async function handleClone() {
    if (!extractJobId) return;
    setCloneStatus("loading");
    setCloneError(null);

    const res = await fetch("/api/voice/clone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ extract_job_id: extractJobId, persona_name: name }),
    });
    const data = await res.json();
    if (!res.ok) {
      setCloneStatus("failed");
      setCloneError(data.error || "Falha ao iniciar clone");
      return;
    }

    setCloneJobId(data.job_id);
    setCloneStatus("queued");
  }

  async function handleSpeak() {
    setTtsLoading(true);
    setTtsAudioUrl(null);
    try {
      const res = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: ttsText, voice_id: voiceId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Falha no TTS");
      }
      const blob = await res.blob();
      setTtsAudioUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      alert(e.message || "Erro ao falar");
    } finally {
      setTtsLoading(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">🎙️ VOZ</h1>

      <div className="rounded-xl border border-gray-800 p-4 space-y-3">
        <h2 className="font-semibold">VOZ-1 · Dados da voz</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome da voz"
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="URL do YouTube"
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm"
        />
        <button
          onClick={handleExtract}
          disabled={!name || !url || extractStatus === "loading" || extractStatus === "queued" || extractStatus === "processing"}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {extractStatus === "loading" ? "Iniciando..." : "Extrair MP3"}
        </button>

        {(extractStatus === "queued" || extractStatus === "processing") && (
          <p className="text-sm text-blue-400">Extraindo áudio... ({extractStatus})</p>
        )}
        {extractStatus === "failed" && <p className="text-sm text-red-400">{extractError}</p>}
      </div>

      {extractJobId && extractStatus === "completed" && (
        <div className="rounded-xl border border-gray-800 p-4 space-y-3">
          <h2 className="font-semibold">VOZ-2 · Preview do áudio extraído</h2>
          <p className="text-sm text-gray-400">Nome da voz: {name}</p>
          <audio controls className="w-full" src={`/api/voice/audio/${extractJobId}`} />

          <button
            onClick={handleClone}
            disabled={cloneStatus === "loading" || cloneStatus === "queued" || cloneStatus === "processing"}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {cloneStatus === "loading" ? "Iniciando clone..." : "Clonar voz"}
          </button>

          {(cloneStatus === "queued" || cloneStatus === "processing") && (
            <p className="text-sm text-yellow-400">Clonando voz... ({cloneStatus})</p>
          )}
          {cloneStatus === "failed" && <p className="text-sm text-red-400">{cloneError}</p>}
          {cloneStatus === "completed" && voiceId && (
            <p className="text-sm text-green-400">Clone pronto ✅ Voice ID: {voiceId}</p>
          )}
        </div>
      )}

      {voiceId && (
        <div className="rounded-xl border border-gray-800 p-4 space-y-3">
          <h2 className="font-semibold">VOZ-3 · Teste falando com sua voz</h2>
          <textarea
            value={ttsText}
            onChange={(e) => setTtsText(e.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm min-h-[100px]"
            placeholder="Digite o texto para falar"
          />
          <button
            onClick={handleSpeak}
            disabled={!ttsText || ttsLoading}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {ttsLoading ? "Gerando áudio..." : "Falar com minha voz"}
          </button>
          {ttsAudioUrl && <audio controls className="w-full" src={ttsAudioUrl} />}
        </div>
      )}
    </div>
  );
}
