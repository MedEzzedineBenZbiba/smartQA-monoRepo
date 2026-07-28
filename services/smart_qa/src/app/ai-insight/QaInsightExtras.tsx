"use client";

import { useAuthStore } from "@/stores/useAuthStore";
import { DuplicatesPanel } from "./DuplicatesPanel";
import { ChatWidget } from "./ChatWidget";

export function QaInsightExtras() {
  const session = useAuthStore((s) => s.session);
  const isQA = session?.role.includes("QA");

  if (!isQA) return null;

  return (
    <>
      <div className="px-[100px] pb-10">
        <DuplicatesPanel />
      </div>
      <ChatWidget />
    </>
  );
}
