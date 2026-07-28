import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decrypt } from "@/lib/encryptSession";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8002";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params; // 👈 await

  const session = (await cookies()).get("session")?.value ?? null;
  const token = session
    ? ((await decrypt(session)) as any)?.access_token
    : null;

  const res = await fetch(`${API_BASE}/ingestion/sync-jobs/${id}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  return NextResponse.json({}, { status: res.status });
}
