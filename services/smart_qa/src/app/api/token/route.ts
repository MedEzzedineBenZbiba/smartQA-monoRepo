// app/api/token/route.ts
import { cookies } from "next/headers";
import { decrypt } from "@/lib/encryptSession";
import { NextResponse } from "next/server";

export async function GET() {
  const cookieStore = await cookies();
  const encrypted = cookieStore.get("session")?.value;

  if (!encrypted) {
    return NextResponse.json({ error: "No session" }, { status: 401 });
  }

  const session = (await decrypt(encrypted)) as SessionData;

  if (!session?.access_token) {
    return NextResponse.json({ error: "No token" }, { status: 401 });
  }

  return NextResponse.json({ token: session.access_token });
}
