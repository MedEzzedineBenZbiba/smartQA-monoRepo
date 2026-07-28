"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/stores/useAuthStore";

export default function AuthHydrator({
  session,
}: {
  session: SessionData | null;
}) {
  const setSession = useAuthStore((s) => s.setSession);

  useEffect(() => {
    setSession(session);
  }, [session, setSession]);

  return null;
}
