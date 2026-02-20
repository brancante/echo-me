import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { query } from "@/lib/db";
import { pushJob } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const formData = await req.formData();
    const file = formData.get("file") as File;
    
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const name = formData.get("name") as string || file.name;
    const description = formData.get("description") as string || "";

    // Create product record
    const result = await query(
      `INSERT INTO products (user_id, name, description, source_file, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [user.id, name, description, file.name, JSON.stringify({ size: file.size, type: file.type })]
    );
    
    const productId = result.rows[0].id;

    // Create RAG ingestion job
    const jobResult = await query(
      `INSERT INTO jobs (user_id, type, status, input)
       VALUES ($1, 'rag_ingest', 'pending', $2)
       RETURNING id`,
      [user.id, JSON.stringify({ product_id: productId, filename: file.name })]
    );
    
    const jobId = jobResult.rows[0].id;
    await pushJob("rag_ingest", jobId);

    return NextResponse.json({ 
      status: "queued", 
      product_id: productId,
      job_id: jobId,
      message: "Product upload queued for processing" 
    });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Error uploading product:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
