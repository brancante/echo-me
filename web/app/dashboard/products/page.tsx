"use client";

import { useState } from "react";

export default function ProductsPage() {
  const [dragging, setDragging] = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    // TODO: upload files via /api/products/upload
    const files = Array.from(e.dataTransfer.files);
    console.log("Files to upload:", files.map((f) => f.name));
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">📦 Product Catalog</h1>
      <p className="text-gray-400">
        Upload CSVs, PDFs, or text files with your product information. These get chunked, embedded, and used for RAG-grounded answers.
      </p>

      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`rounded-xl border-2 border-dashed p-12 text-center transition ${
          dragging ? "border-brand-500 bg-brand-600/10" : "border-gray-700"
        }`}
      >
        <p className="text-gray-400">Drag & drop files here, or</p>
        <button className="mt-2 rounded-lg bg-gray-800 px-4 py-2 text-sm hover:bg-gray-700 transition">
          Browse Files
        </button>
        <p className="mt-2 text-xs text-gray-600">Supports CSV, PDF, TXT — max 50MB per file</p>
      </div>

      {/* Product list placeholder */}
      <div className="rounded-xl border border-gray-800 p-6 text-center text-gray-600">
        No products uploaded yet. Upload your first catalog above.
      </div>
    </div>
  );
}
