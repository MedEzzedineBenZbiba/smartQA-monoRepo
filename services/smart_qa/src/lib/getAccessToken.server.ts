// lib/getAccessToken.server.ts
import "server-only";
import { cookies } from "next/headers";
import { decrypt } from "@/lib/encryptSession";

export async function getAccessTokenServer(): Promise<string> {
  const cookieStore = await cookies();
  const encrypted = cookieStore.get("session")?.value;

  if (!encrypted) throw new Error("UNAUTHORIZED");

  const session = (await decrypt(encrypted)) as SessionData;

  if (!session?.access_token) throw new Error("UNAUTHORIZED");

  return session.access_token;
}
