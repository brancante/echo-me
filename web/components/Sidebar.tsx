"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useEffect, useState } from "react";

const nav = [
  { href: "/dashboard", label: "Visão geral", icon: "📊" },
  { href: "/dashboard/chat", label: "Chat Sandbox", icon: "💬" },
  { href: "/dashboard/voice", label: "Voz", icon: "🎙️" },
  { href: "/dashboard/persona", label: "Persona", icon: "🧠" },
  { href: "/dashboard/products", label: "Produtos", icon: "📦" },
  { href: "/dashboard/clients", label: "Clientes", icon: "👥" },
  { href: "/dashboard/settings", label: "Configurações", icon: "⚙️" },
];

export default function Sidebar() {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [path]);

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-gray-800 bg-gray-950/95 p-3 backdrop-blur md:hidden">
        <div className="text-lg font-bold">
          Echo <span className="text-brand-500">Me</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-200"
          aria-expanded={open}
          aria-controls="mobile-drawer"
        >
          {open ? "Fechar" : "Menu"}
        </button>
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 border-r border-gray-800 p-4 md:block">
        <div className="mb-6 text-xl font-bold">
          Echo <span className="text-brand-500">Me</span>
        </div>
        <nav className="space-y-1">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={clsx(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition whitespace-nowrap",
                path === n.href
                  ? "bg-brand-600/20 text-brand-500 font-medium"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
              )}
            >
              <span>{n.icon}</span>
              {n.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Fechar menu"
            onClick={() => setOpen(false)}
          />
          <aside
            id="mobile-drawer"
            className="absolute left-0 top-0 h-full w-72 max-w-[85vw] border-r border-gray-800 bg-gray-950 p-4"
          >
            <div className="mb-4 text-xl font-bold">
              Echo <span className="text-brand-500">Me</span>
            </div>
            <nav className="space-y-1">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className={clsx(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition",
                    path === n.href
                      ? "bg-brand-600/20 text-brand-500 font-medium"
                      : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
                  )}
                >
                  <span>{n.icon}</span>
                  {n.label}
                </Link>
              ))}
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}
