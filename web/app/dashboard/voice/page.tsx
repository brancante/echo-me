"use client";

import { useState, useEffect } from "react";

type JobStatus = "idle" | "loading" | "queued" | "processing" | "completed" | "failed";

export default function VoicePage() {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<JobStatus>("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiceId, setVoiceId] = useState<string | null>(null);

  // Poll job status
  useEffect(() => {
    if (!jobId || status === "completed" || status === "failed") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/voice/jobs/${jobId}`);
        if (!res.ok) throw new Error("Failed to fetch job status");
        
        const data = await res.json();
        const job = data.job;
        
        setStatus(job.status as JobStatus);
        
        if (job.status === "completed") {
          const output = typeof job.output === "string" ? JSON.parse(job.output) : job.output;
          setVoiceId(output?.voice_id || null);
        } else if (job.status === "failed") {
          setError(job.error || "Voice cloning failed");
        }
      } catch (err) {
        console.error("Error polling job:", err);
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [jobId, status]);

  async function handleClone() {
    setStatus("loading");
    setError(null);
    setVoiceId(null);
    
    try {
      const res = await fetch("/api/voice/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtube_url: url, persona_name: name }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Clone failed");
      }
      
      const data = await res.json();
      setJobId(data.job_id);
      setStatus("queued");
    } catch (err: any) {
      setError(err.message || "Failed to start voice clone");
      setStatus("idle");
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">🎙️ Voice Cloning</h1>
      <p className="text-gray-400">
        Paste a YouTube video URL with clear speech. We'll extract the audio, clean it up, and clone the voice.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-gray-500 mb-1">Persona Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sales Expert João"
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm focus:border-brand-500 focus:outline-none"
            disabled={status !== "idle"}
          />
        </div>
        <div>
          <label className="block text-sm text-gray-500 mb-1">YouTube URL</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm focus:border-brand-500 focus:outline-none"
            disabled={status !== "idle"}
          />
        </div>
        <button
          onClick={handleClone}
          disabled={!url || !name || status !== "idle"}
          className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-semibold hover:bg-brand-700 transition disabled:opacity-50"
        >
          {status === "loading" ? "Starting..." : "Start Voice Clone"}
        </button>
      </div>

      {/* Status display */}
      {status === "queued" && (
        <div className="rounded-lg border border-blue-800 bg-blue-900/20 p-4 text-sm text-blue-400">
          <div className="flex items-center gap-2">
            <div className="animate-spin h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full"></div>
            <span>Job queued (ID: {jobId}). Waiting for worker...</span>
          </div>
        </div>
      )}

      {status === "processing" && (
        <div className="rounded-lg border border-yellow-800 bg-yellow-900/20 p-4 text-sm text-yellow-400">
          <div className="flex items-center gap-2">
            <div className="animate-spin h-4 w-4 border-2 border-yellow-400 border-t-transparent rounded-full"></div>
            <span>Processing voice clone... This may take a few minutes.</span>
          </div>
        </div>
      )}

      {status === "completed" && voiceId && (
        <div className="rounded-lg border border-green-800 bg-green-900/20 p-4 text-sm text-green-400">
          <p className="font-semibold">✓ Voice cloning completed!</p>
          <p className="mt-1 text-xs text-gray-400">Voice ID: {voiceId}</p>
        </div>
      )}

      {(status === "failed" || error) && (
        <div className="rounded-lg border border-red-800 bg-red-900/20 p-4 text-sm text-red-400">
          <p className="font-semibold">✗ Voice cloning failed</p>
          <p className="mt-1 text-xs">{error || "Unknown error"}</p>
          <button
            onClick={() => {
              setStatus("idle");
              setJobId(null);
              setError(null);
            }}
            className="mt-2 text-xs underline"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
