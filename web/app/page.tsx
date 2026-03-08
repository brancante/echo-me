import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function LandingPage() {
  const session = await getServerSession(authOptions);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="max-w-3xl space-y-6">
        <h1 className="text-5xl font-bold tracking-tight">
          Echo <span className="text-brand-500">Me</span>
        </h1>

        <p className="text-xl text-gray-300">
          Plataforma para criar seu gêmeo digital com voz e avatar.
        </p>

        <p className="text-sm text-gray-400 leading-relaxed">
          No Echo Me você treina uma persona com vídeo (YouTube ou upload), conecta seu conhecimento
          (RAG) e testa respostas em texto, áudio e vídeo para atendimento automático.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          {session ? (
            <Link
              href="/dashboard"
              className="inline-block rounded-lg bg-brand-600 px-8 py-3 text-lg font-semibold hover:bg-brand-700 transition"
            >
              Ir para o painel
            </Link>
          ) : (
            <Link
              href="/login"
              className="inline-block rounded-lg bg-brand-600 px-8 py-3 text-lg font-semibold hover:bg-brand-700 transition"
            >
              Login
            </Link>
          )}
        </div>
      </div>

      <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl w-full">
        <Feature
          icon="🎙️"
          title="Voz + Avatar"
          desc="Treine com YouTube ou vídeo local via HeyGen."
        />
        <Feature
          icon="🧠"
          title="Conhecimento (RAG)"
          desc="Use CSV, PDF e texto para respostas com base real."
        />
        <Feature
          icon="💬"
          title="Teste rápido"
          desc="Valide respostas do avatar em texto/áudio/vídeo."
        />
      </div>

      <footer className="mt-24 text-sm text-gray-600">© 2026 Echo Me</footer>
    </main>
  );
}

function Feature({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-gray-800 p-6 text-left bg-gray-950/40">
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="text-lg font-semibold mb-1">{title}</h3>
      <p className="text-sm text-gray-400">{desc}</p>
    </div>
  );
}
