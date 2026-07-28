// lib/getAccessToken.client.ts

import { useAuthStore } from "@/stores/useAuthStore";

export function getAccessTokenClient(): string {
  const { session, hasHydrated } = useAuthStore.getState();
  if (!hasHydrated) {
    throw new Error("AUTH_NOT_READY"); // distinct from UNAUTHORIZED
  }
  if (!session?.access_token) {
    throw new Error("UNAUTHORIZED");
  }
  return session.access_token;
}
