import { NextResponse } from "next/server";

export async function GET() {
  // TODO: fetch clients + conversations from DB
  return NextResponse.json({ clients: [], total: 0 });
}
