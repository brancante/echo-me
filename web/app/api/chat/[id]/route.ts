import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { query } from "@/lib/db";

/**
 * GET /api/chat/[id]
 * Get chat job status and result scoped to authenticated user.
 */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const jobId = params.id;
    if (!jobId || typeof jobId !== "string") {
      return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
    }

    const result = await query(
      `SELECT id, status, output as result_data, error as error_message, created_at, completed_at
       FROM jobs
       WHERE id = $1 AND user_id = $2`,
      [jobId, user.id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("Chat status API error:", error);
    return NextResponse.json({ error: "Failed to fetch job status" }, { status: 500 });
  }
}
