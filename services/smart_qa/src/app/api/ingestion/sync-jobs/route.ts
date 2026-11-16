import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decrypt } from "@/lib/encryptSession";

// const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8002";
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://localhost";

interface DecryptedSession {
  access_token?: string;
}

async function getToken() {
  const session = (await cookies()).get("session")?.value ?? null;
  if (!session) return null;
  const decrypted = (await decrypt(session)) as DecryptedSession;
  return decrypted?.access_token ?? null;
}

export async function GET() {
  const token = await getToken();
  const res = await fetch(`${API_BASE}/ingestion/sync-jobs`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest) {
  const token = await getToken();
  const body = await req.json();
  const res = await fetch(`${API_BASE}/ingestion/sync-jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
