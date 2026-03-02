"use client";

import { useEffect, useState } from "react";

type JobStatus = "idle" | "loading" | "queued" | "processing" | "completed" | "failed";

type AvatarChatResult = {
  text: string;
  video_url?: string | null;
  audio_url?: string | null;
  avatar_id?: string | null;
  voice_id?: string | null;
  note?: string;
};

const API_PREFIX = "/echome/api";

export default function VoicePage() {
  const [name, setName] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);

  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const [modelReady, setModelReady] = useState(false);
  const [modelReason, setModelReason] = useState<string | null>("Checando status...");

  const [testInput, setTestInput] = useState("Oi, você pode se apresentar rapidinho?");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatResult, setChatResult] = useState<AvatarChatResult | null>(null);

  async function refreshModelStatus() {
    try {
      const res = await fetch(`${API_PREFIX}/voice/model-status`);
      const data = await res.json();
      if (!res.ok) return;
      setModelReady(Boolean(data?.ready));
      setModelReason(data?.reason || null);
    } catch {
      setModelReady(false);
      setModelReason("Não foi possível verificar status do modelo.");
    }
  }

  useEffect(() => {
    refreshModelStatus();
  }, []);

  useEffect(() => {
    if (!jobId || status === "completed" || status === "failed") return;

    const interval = setInterval(async () => {
      const res = await fetch(`${API_PREFIX}/voice/jobs/${jobId}`);
      if (!res.ok) return;

      const data = await res.json();
      const job = data?.job;
      const nextStatus = job?.status as JobStatus;
      setStatus(nextStatus);

      if (nextStatus === "completed") {
        const output = typeof job.output === "string" ? JSON.parse(job.output) : job.output;
        setResult(output || null);
        refreshModelStatus();
      }

      if (nextStatus === "failed") {
        setError(job?.error || "Falha no treinamento HeyGen");
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [jobId, status]);

  async function handleTrain() {
    setStatus("loading");
    setError(null);
    setResult(null);
    setJobId(null);

    try {
      const formData = new FormData();
      formData.append("persona_name", name);
      if (youtubeUrl) formData.append("youtube_url", youtubeUrl);
      if (videoFile) formData.append("video_file", videoFile);

      const res = await fetch(`${API_PREFIX}/voice/clone`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setStatus("failed");
        setError(data?.error || "Falha ao iniciar treinamento");
        return;
      }

      setJobId(data.job_id);
      setStatus("queued");
      setModelReady(false);
    } catch (e: any) {
      setStatus("failed");
      setError(e?.message || "Erro inesperado");
    }
  }

  async function handleAvatarTest() {
    setChatLoading(true);
    setChatError(null);

    try {
      const res = await fetch(`${API_PREFIX}/voice/avatar-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: testInput }),
      });

      const data = await res.json();
      if (!res.ok) {
        setChatError(data?.error || "Falha no teste do avatar");
        setChatLoading(false);
        return;
      }

      setChatResult(data);
    } catch (e: any) {
      setChatError(e?.message || "Erro inesperado no teste");
    } finally {
      setChatLoading(false);
    }
  }

  const hasSource = Boolean(youtubeUrl.trim() || videoFile);

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">🎭 Avatar + Voz (HeyGen)</h1>

      <div className="rounded-xl border border-gray-800 p-4 space-y-3">
        <h2 className="font-semibold">1) Treinamento</h2>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome da persona"
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm"
        />

        <input
          value={youtubeUrl}
          onChange={(e) => setYoutubeUrl(e.target.value)}
          placeholder="URL do YouTube (opcional se enviar vídeo)"
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm"
        />

        <div className="space-y-1">
          <label className="text-sm text-gray-300">Upload de vídeo local (opcional se usar YouTube)</label>
          <input
            type="file"
            accept="video/*"
            onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm"
          />
          {videoFile && <p className="text-xs text-gray-400">Arquivo: {videoFile.name}</p>}
        </div>

        <button
          onClick={handleTrain}
          disabled={!name || !hasSource || status === "loading" || status === "queued" || status === "processing"}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {status === "loading" ? "Iniciando..." : "Treinar no HeyGen"}
        </button>

        {(status === "queued" || status === "processing") && (
          <p className="text-sm text-blue-400">Treinamento em andamento... ({status})</p>
        )}

        {status === "failed" && <p className="text-sm text-red-400">{error}</p>}
      </div>

      {status === "completed" && (
        <div className="rounded-xl border border-gray-800 p-4 space-y-2">
          <h2 className="font-semibold">Concluído ✅</h2>
          <p className="text-sm text-gray-300">Job ID: {jobId}</p>
          {result?.training_id && <p className="text-sm text-green-400">Training ID: {result.training_id}</p>}
          {result?.avatar_id && <p className="text-sm text-green-400">Avatar ID: {result.avatar_id}</p>}
          {result?.voice_id && <p className="text-sm text-green-400">Voice ID: {result.voice_id}</p>}
        </div>
      )}

      <div className="rounded-xl border border-gray-800 p-4 space-y-3">
        <h2 className="font-semibold">2) Teste</h2>

        <div className="flex gap-2">
          <input
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            placeholder="Digite um texto para testar"
            className="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm"
          />
          <button
            onClick={handleAvatarTest}
            disabled={!modelReady || !testInput.trim() || chatLoading}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {chatLoading ? "Testando..." : "Teste"}
          </button>
        </div>

        {!modelReady && <p className="text-xs text-amber-400">{modelReason || "Modelo ainda não pronto."}</p>}
        {chatError && <p className="text-xs text-red-400">{chatError}</p>}

        {chatResult && (
          <div className="space-y-2 rounded-lg border border-gray-700 bg-gray-900/50 p-3">
            <p className="text-sm text-gray-100 whitespace-pre-wrap">{chatResult.text}</p>

            {chatResult.video_url && (
              <iframe
                src={chatResult.video_url}
                className="h-72 w-full rounded-lg border border-gray-700"
                allow="autoplay; fullscreen"
              />
            )}

            {!chatResult.video_url && chatResult.audio_url && (
              <audio controls src={chatResult.audio_url} className="w-full" />
            )}

            {chatResult.note && <p className="text-xs text-amber-400">{chatResult.note}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
