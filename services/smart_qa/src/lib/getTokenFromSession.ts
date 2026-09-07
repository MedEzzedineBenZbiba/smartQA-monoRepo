import { cookies } from "next/headers";
import { decrypt } from "@/lib/encryptSession";
import { SessionPayload } from "./session.type";

export async function getTokenFromSession(): Promise<string | null> {
  const session = (await cookies()).get("session")?.value ?? null;
  if (!session) return null;
  const payload = (await decrypt(session)) as SessionPayload;
  return payload?.access_token ?? null;
}
