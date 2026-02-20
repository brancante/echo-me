"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const nav = [
  { href: "/dashboard", label: "Overview", icon: "📊" },
  { href: "/dashboard/voice", label: "Voice", icon: "🎙️" },
  { href: "/dashboard/persona", label: "Persona", icon: "🧠" },
  { href: "/dashboard/products", label: "Products", icon: "📦" },
  { href: "/dashboard/clients", label: "Clients", icon: "👥" },
  { href: "/dashboard/settings", label: "Settings", icon: "⚙️" },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside className="w-56 shrink-0 border-r border-gray-800 p-4 space-y-1">
      <div className="text-xl font-bold mb-6">
        Echo <span className="text-brand-500">Me</span>
      </div>
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
    </aside>
  );
}
