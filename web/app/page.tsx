import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      {/* Hero */}
      <div className="max-w-2xl space-y-6">
        <h1 className="text-5xl font-bold tracking-tight">
          Echo <span className="text-brand-500">Me</span>
        </h1>
        <p className="text-xl text-gray-400">
          Clone your voice. Upload your knowledge. Let your digital twin answer customers 24/7 — in your voice, with your expertise.
        </p>
        <Link
          href="/dashboard"
          className="inline-block rounded-lg bg-brand-600 px-8 py-3 text-lg font-semibold hover:bg-brand-700 transition"
        >
          Get Started
        </Link>
      </div>

      {/* Features */}
      <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl">
        <Feature icon="🎙️" title="Voice Cloning" desc="Paste a YouTube link. We clone your voice in minutes using ElevenLabs." />
        <Feature icon="🧠" title="Knowledge RAG" desc="Upload CSVs, PDFs, or text. Your persona answers with grounded facts." />
        <Feature icon="💬" title="Telegram Channel" desc="Customers message your bot and get voice replies that sound like you." />
      </div>

      <footer className="mt-32 text-sm text-gray-600">
        © 2026 Echo Me — Built by Brancante
      </footer>
    </main>
  );
}

function Feature({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-gray-800 p-6 text-left">
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="text-lg font-semibold mb-1">{title}</h3>
      <p className="text-sm text-gray-400">{desc}</p>
    </div>
  );
}
