"use server";

import { getIssues } from "@/services/issues.service";
import { IssuesTable } from "@/components/IssuesTable";
import { Pagination } from "@/components/Pagination";
import { redirect } from "next/navigation";
import { useAuthStore } from "@/stores/useAuthStore";
import { getAccessTokenClient } from "@/lib/getAccessToken.client";
import { getAccessTokenServer } from "@/lib/getAccessToken.server";

const LIMIT = 20;

interface Props {
  searchParams: Promise<{ page?: string }>;
}

export default async function Dashboard({ searchParams }: Props) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  let data: Awaited<ReturnType<typeof getIssues>>;

  try {
    const token = await getAccessTokenServer();
    data = await getIssues(token, page, LIMIT);
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") redirect("/login");
    throw err; // let Next.js error boundary handle anything else
  }

  const openCount = data.data.filter((i) => i.state === "open").length;
  const closedCount = data.data.filter((i) => i.state === "closed").length;

  return (
    <main className="px-[80px] mt-[35px] pb-16">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <svg
          className="w-5 h-5 text-gray-700"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
        <h1 className="text-xl font-semibold text-gray-900">GitHub Issues</h1>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 mb-8 max-w-xs">
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
          <p className="text-2xl font-semibold text-gray-900">{openCount}</p>
          <p className="text-xs text-gray-500 mt-0.5">Open</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
          <p className="text-2xl font-semibold text-gray-900">{closedCount}</p>
          <p className="text-xs text-gray-500 mt-0.5">Closed</p>
        </div>
      </div>

      {/* Issues table */}
      <IssuesTable issues={data.data} />

      {/* Pagination */}
      <Pagination page={page} limit={LIMIT} total={data.total} />
    </main>
  );
}
