export default function DashboardOverview() {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Painel</h1>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Personas" value="0" icon="🧠" />
        <StatCard label="Produtos" value="0" icon="📦" />
        <StatCard label="Conversas" value="0" icon="💬" />
        <StatCard label="Mensagens hoje" value="0" icon="📩" />
      </div>

      {/* Quick actions */}
      <div className="rounded-xl border border-gray-800 p-6">
        <h2 className="text-lg font-semibold mb-4">Início rápido</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-400">
          <li>Clone sua voz a partir de um vídeo do YouTube</li>
          <li>Revise e edite o perfil da sua persona</li>
          <li>Suba catálogos de produtos (CSV, PDF ou texto)</li>
          <li>Conecte seu bot do Telegram e comece a receber mensagens</li>
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
