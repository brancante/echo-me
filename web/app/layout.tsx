import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Echo Me — Clone Your Voice, Scale Your Knowledge",
  description: "Virtual persona platform powered by voice cloning and RAG",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
