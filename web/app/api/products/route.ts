import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireAuth();
    const result = await query(
      `SELECT id, name, description, source_file, created_at 
       FROM products 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [user.id]
    );
    return NextResponse.json({ products: result.rows, total: result.rows.length });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Error fetching products:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
