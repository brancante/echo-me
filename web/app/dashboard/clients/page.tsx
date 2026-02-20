export default function ClientsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">👥 Clients & Conversations</h1>
      <p className="text-gray-400">
        Track who's talking to your persona and review conversation history.
      </p>

      <div className="rounded-xl border border-gray-800 p-6 text-center text-gray-600">
        No conversations yet. Connect your Telegram bot in Settings to start receiving messages.
      </div>
    </div>
  );
}
