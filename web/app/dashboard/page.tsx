export default function DashboardOverview() {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Personas" value="0" icon="🧠" />
        <StatCard label="Products" value="0" icon="📦" />
        <StatCard label="Conversations" value="0" icon="💬" />
        <StatCard label="Messages Today" value="0" icon="📩" />
      </div>

      {/* Quick actions */}
      <div className="rounded-xl border border-gray-800 p-6">
        <h2 className="text-lg font-semibold mb-4">Quick Start</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-400">
          <li>Clone your voice from a YouTube video</li>
          <li>Review and edit your persona profile</li>
          <li>Upload product catalogs (CSV, PDF, or text)</li>
          <li>Connect your Telegram bot and start receiving queries</li>
        </ol>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="rounded-xl border border-gray-800 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-500">{label}</span>
        <span className="text-xl">{icon}</span>
      </div>
      <div className="text-3xl font-bold">{value}</div>
    </div>
  );
}
