import { NextResponse } from "next/server";

export async function GET() {
  // TODO: fetch products from DB for current user
  return NextResponse.json({ products: [], total: 0 });
}
