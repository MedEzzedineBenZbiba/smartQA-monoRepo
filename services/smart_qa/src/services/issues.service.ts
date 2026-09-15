import { getAccessTokenClient } from "@/lib/getAccessToken.client";
import type { Issue } from "@/types/issue.type";

// const API_BASE = "http://localhost:8003";
const API_BASE = "https://localhost";

export interface ClusterSummary {
  cluster_id: number;
  cluster_label: string;
  openCount: number;
  closedCount: number;
  gemini_summary: string | null;
}

export interface ClusterIssue {
  _id: string;
  issueId: string;
  title: string;
  state: "open" | "closed";
  created_at: string | null;
  url: string;
}

export interface ClusterRepoItem {
  repo: string;
  count: number;
}

export async function getClusters(
  token: string,
  page = 1,
  limit = 6,
  search = "",
): Promise<{ clusters: ClusterSummary[]; total: number }> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    ...(search && { search }),
  });
  const res = await fetch(`${API_BASE}/issues/clusters?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error(`Failed to fetch clusters: ${res.statusText}`);
  return res.json();
}

export async function getClusterRepos(
  token: string,
  clusterId: number,
  page = 1,
  limit = 8,
): Promise<{ data: ClusterRepoItem[]; total: number }> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  const res = await fetch(
    `${API_BASE}/issues/clusters/${clusterId}/repos?${params}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok)
    throw new Error(`Failed to fetch cluster repos: ${res.statusText}`);
  return res.json();
}

export async function getClusterRepoIssues(
  token: string,
  clusterId: number,
  repo: string,
  page = 1,
  limit = 20,
): Promise<{ data: ClusterIssue[]; total: number }> {
  const params = new URLSearchParams({
    repo,
    page: String(page),
    limit: String(limit),
  });
  const res = await fetch(
    `${API_BASE}/issues/clusters/${clusterId}/issues?${params}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok)
    throw new Error(`Failed to fetch cluster issues: ${res.statusText}`);
  return res.json();
}

export async function getIssues(
  token: string,
  page: number,
  limit: number,
  search = "",
  state: "open" | "closed" | "all" = "all",
  repos: string[] = [], // ← added
): Promise<{ data: Issue[]; total: number }> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    ...(search && { search }),
    ...(state !== "all" && { state }),
    ...(repos.length > 0 && { repos: repos.join(",") }), // ← added
  });

  console.log("getIssues token:", token);

  const res = await fetch(`${API_BASE}/issues?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    // no cache — always fresh
    cache: "no-store",
  });

  if (!res.ok) {
    let details: unknown;
    try {
      details = await res.clone().json();
    } catch {
      details = await res.text().catch(() => null);
    }

    console.error("getIssues failed", {
      status: res.status,
      statusText: res.statusText,
      url: res.url,
      details,
    });

    if (res.status === 401) {
      // bubble up so middleware / layout can redirect to login
      throw new Error(`UNAUTHORIZED: ${JSON.stringify(details)}`);
    }

    throw new Error(
      `Failed to fetch issues: ${res.status} ${res.statusText} — ${JSON.stringify(details)}`,
    );
  }

  const json = await res.json();

  // handle both shapes:
  // { data: Issue[], total: number }  ← preferred
  // Issue[]                           ← flat array fallback
  if (Array.isArray(json)) {
    return { data: json, total: json.length };
  }
  return json;
}

import type { IssueDashboardStats } from "@/types/issue.type";

export async function getIssuesDashboardStats(): Promise<IssueDashboardStats> {
  const token = await getAccessTokenClient();

  const res = await fetch(`${API_BASE}/issues/dashboard-stats`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok)
    throw new Error(`Failed to fetch dashboard stats: ${res.statusText}`);

  return res.json();
}
// services/issues.service.ts — add this function

// services/issues.service.ts — add this function
import type { QADashboardStats } from "@/types/issue.type";

export async function getQADashboardStats(): Promise<QADashboardStats> {
  const token = await getAccessTokenClient();

  const res = await fetch(`${API_BASE}/issues/qa-dashboard-stats`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok)
    throw new Error(`Failed to fetch QA dashboard stats: ${res.statusText}`);

  return res.json();
}
import type {
  DuplicateGroup,
  ChatMessage,
  ChatResponse,
} from "@/types/issue.type";

export async function getDuplicateIssues(): Promise<{
  duplicateGroups: DuplicateGroup[];
}> {
  const token = await getAccessTokenClient();
  const res = await fetch(`${API_BASE}/issues/duplicates`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok)
    throw new Error(`Failed to fetch duplicate issues: ${res.statusText}`);
  return res.json();
}

export interface RepoListResult {
  data: { repo: string; count: number }[];
  total: number;
}

export async function getRepos(
  search = "",
  page = 1,
  limit = 20,
): Promise<RepoListResult> {
  const token = await getAccessTokenClient();
  const params = new URLSearchParams({
    search,
    page: String(page),
    limit: String(limit),
  });
  const res = await fetch(`${API_BASE}/issues/repos?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error(`Failed to fetch repos: ${res.statusText}`);
  return res.json();
}

export async function chatWithIssues(
  query: string,
  history: ChatMessage[] = [],
): Promise<ChatResponse> {
  const token = await getAccessTokenClient();
  const res = await fetch(`${API_BASE}/issues/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, history }),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error(`Chat request failed: ${res.statusText}`);
  return res.json();
}

// services/issues.service.ts

export interface SearchedIssue {
  _id: string;
  issueId: string;
  title: string;
  body: string | undefined | null;
  state: string;
  cluster_id: number | null;
  cluster_label: string | null;
  created_at: Date | string | null;
  updated_at: Date | string | null;
  url: string;
  similarity_score: number | null; // null for text-only fallback results
  isPoorlyDescribed: boolean;
  isNoise: boolean;
  match_type: "vector" | "text"; // how this specific result was found
}

export interface SemanticSearchResult {
  data: SearchedIssue[];
  total: number;
  query: string;
  mode: "hybrid" | "text-only"; // tells frontend what happened
}

export async function searchIssuesSemantic(
  token: string,
  query: string,
  page = 1,
  state: "open" | "closed" | "all" = "all",
  limit = 20,
): Promise<SemanticSearchResult> {
  const params = new URLSearchParams({
    query,
    page: String(page),
    state,
    limit: String(limit),
  });
  const res = await fetch(`${API_BASE}/issues/search?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Search failed");
  return res.json();
}
