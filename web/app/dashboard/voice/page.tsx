"use client";

import { useState } from "react";

export default function VoicePage() {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");

  async function handleClone() {
    setStatus("loading");
    try {
      const res = await fetch("/api/voice/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtube_url: url, persona_name: name }),
      });
      if (!res.ok) throw new Error("Clone failed");
      setStatus("done");
    } catch {
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
          />
        </div>
        <div>
          <label className="block text-sm text-gray-500 mb-1">YouTube URL</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>
        <button
          onClick={handleClone}
          disabled={!url || !name || status === "loading"}
          className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-semibold hover:bg-brand-700 transition disabled:opacity-50"
        >
          {status === "loading" ? "Cloning..." : status === "done" ? "✓ Queued" : "Start Voice Clone"}
        </button>
      </div>

      {status === "done" && (
        <div className="rounded-lg border border-green-800 bg-green-900/20 p-4 text-sm text-green-400">
          Voice clone job queued! Check back in a few minutes.
        </div>
      )}
    </div>
  );
}
