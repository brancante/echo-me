"use client";

import { useState } from "react";

export default function SettingsPage() {
  const [botToken, setBotToken] = useState("");

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
