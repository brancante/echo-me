"use client";

import { useState } from "react";

export default function PersonaPage() {
  const [persona, setPersona] = useState({
    name: "",
    tone: "",
    vocabulary: "",
    greeting: "",
    fallback: "I'm not sure about that. Let me check and get back to you.",
  });

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">🧠 Persona Editor</h1>
      <p className="text-gray-400">
        Review and fine-tune the persona extracted from your voice sample. These settings shape how your digital twin responds.
      </p>

      <div className="space-y-4">
        {([
          ["name", "Display Name", "How the persona introduces itself"],
          ["tone", "Tone & Style", "e.g. Professional but warm, uses humor"],
          ["vocabulary", "Vocabulary Notes", "Industry terms, phrases to use/avoid"],
          ["greeting", "Greeting Message", "First message sent to new contacts"],
          ["fallback", "Fallback Response", "When the persona doesn't know the answer"],
        ] as const).map(([key, label, hint]) => (
          <div key={key}>
            <label className="block text-sm text-gray-500 mb-1">{label}</label>
            <textarea
              value={persona[key]}
              onChange={(e) => setPersona({ ...persona, [key]: e.target.value })}
              placeholder={hint}
              rows={key === "tone" || key === "vocabulary" ? 3 : 2}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm focus:border-brand-500 focus:outline-none resize-none"
            />
          </div>
        ))}
        <button className="rounded-lg bg-brand-600 px-6 py-2 text-sm font-semibold hover:bg-brand-700 transition">
          Save Persona
        </button>
      </div>
    </div>
  );
}
