// app/(client)/issues/page.tsx
import { getIssues } from "@/services/issues.service";
import { IssuesClient } from "./IssuesClient";
import { getAccessTokenServer } from "@/lib/getAccessToken.server";

interface PageProps {
  searchParams: Promise<{
    page?: string;
    state?: string;
    search?: string;
    repos?: string; // ← added, comma-separated repo names
  }>;
}

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Issues",
};

export default async function IssuesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Number(params.page ?? 1);
  const state = (params.state as "open" | "closed" | "all") ?? "all";
  const search = params.search ?? "";
  const repos = params.repos ? params.repos.split(",").filter(Boolean) : []; // ← added
  const token = await getAccessTokenServer();

  const { data: issues, total } = await getIssues(
    token,
    page,
    10,
    search,
    state,
    repos, // ← added
  );

  return (
    <IssuesClient
      initialIssues={issues}
      total={total}
      currentPage={page}
      initialState={state}
      initialSearch={search}
      initialRepos={repos} // ← added
    />
  );
}
