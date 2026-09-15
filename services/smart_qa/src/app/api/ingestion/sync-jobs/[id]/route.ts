import { NextRequest, NextResponse } from "next/server";
import { getTokenFromSession } from "@/lib/getTokenFromSession";

// const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8002";
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params; // 👈 await

  const token = await getTokenFromSession();

  const res = await fetch(`${API_BASE}/ingestion/sync-jobs/${id}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  return NextResponse.json({}, { status: res.status });
}
