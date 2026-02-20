import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth();
    const result = await query(
      `SELECT id, type, status, input, output, error, started_at, completed_at, created_at
       FROM jobs 
       WHERE id = $1 AND user_id = $2`,
      [params.id, user.id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json({ job: result.rows[0] });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Error fetching job:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
