import { getAccessTokenServer } from "@/lib/getAccessToken.server";
import { AiInsightClient, type ClusterSummary } from "./Aiinsightclient";
import { QaInsightExtras } from "./QaInsightExtras";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8003";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI insight",
};

interface PageProps {
  searchParams: Promise<{ page?: string; search?: string }>;
}

async function getClusters(
  token: string,
  page: number,
  search: string,
): Promise<{ clusters: ClusterSummary[]; total: number }> {
  try {
    const params = new URLSearchParams({
      page: String(page),
      limit: "6",
      ...(search && { search }),
    });
    const res = await fetch(`${API_BASE}/issues/clusters?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return { clusters: [], total: 0 };
    return await res.json();
  } catch {
    return { clusters: [], total: 0 };
  }
}

export default async function AiInsightPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Number(params.page ?? 1);
  const search = params.search ?? "";
  const token = await getAccessTokenServer();
  const { clusters, total } = await getClusters(token, page, search);

  return (
    <>
      <AiInsightClient
        initialClusters={clusters}
        total={total}
        currentPage={page}
        initialSearch={search}
      />
      <QaInsightExtras />
    </>
  );
}
