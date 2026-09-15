"use client";

import { useState, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { getAccessTokenClient } from "@/lib/getAccessToken.client";
import {
  getClusterRepos,
  getClusterRepoIssues,
  type ClusterRepoItem,
  type ClusterIssue,
} from "@/services/issues.service";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClusterSummary {
  cluster_id: number;
  cluster_label: string;
  openCount: number;
  closedCount: number;
  gemini_summary: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
}

function daysAgo(dateStr: string | null) {
  if (!dateStr) return "—";
  const d = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  return d === 0 ? "today" : d === 1 ? "1d ago" : `${d}d ago`;
}

function resolutionRate(open: number, closed: number) {
  const total = open + closed;
  if (total === 0) return "0%";
  return Math.round((closed / total) * 100) + "%";
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

const REPO_PAGE_SIZE = 8;
const ISSUE_PAGE_SIZE = 10;

// ─── Sub-components ───────────────────────────────────────────────────────────

function StateBadge({ state }: { state: string }) {
  const isOpen = state === "open";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
        isOpen ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${isOpen ? "bg-green-500" : "bg-gray-400"}`}
      />
      {isOpen ? "Open" : "Closed"}
    </span>
  );
}

function AiSummaryBlock({
  summary,
  loading,
  error,
  onGenerate,
}: {
  summary: string | null;
  loading: boolean;
  error: string | null;
  onGenerate: () => void;
}) {
  if (loading) {
    return (
      <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/40 px-5 py-4">
        <div className="flex items-center gap-2.5 text-violet-600 text-[13px] font-medium">
          <SpinnerIcon className="animate-spin w-4 h-4" />
          Generating root-cause summary…
        </div>
        <div className="mt-3 space-y-2">
          <div className="h-3 bg-violet-100 rounded animate-pulse w-3/4" />
          <div className="h-3 bg-violet-100 rounded animate-pulse w-full" />
          <div className="h-3 bg-violet-100 rounded animate-pulse w-5/6" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-4 rounded-xl border border-red-100 bg-red-50/40 px-5 py-4 flex items-start gap-3">
        <span className="text-red-400 mt-0.5">⚠</span>
        <div>
          <p className="text-[13px] text-red-700 font-medium">
            Summary generation failed
          </p>
          <p className="text-[12px] text-red-500 mt-0.5">{error}</p>
          <button
            onClick={onGenerate}
            className="mt-2 text-[12px] font-medium text-red-600 hover:text-red-800 underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (summary) {
    return (
      <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/40 px-5 py-4">
        <div className="flex items-center gap-2 mb-2.5">
          <SparkleIcon className="w-4 h-4 text-violet-500" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-violet-500">
            AI Root-Cause Summary
          </span>
        </div>
        <p className="text-[13.5px] text-gray-700 leading-relaxed">{summary}</p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <button
        onClick={onGenerate}
        className="flex items-center gap-2 text-[13px] font-medium px-4 py-2 rounded-lg
          border border-violet-200 bg-white text-violet-700
          hover:bg-violet-50 transition-colors"
      >
        <SparkleIcon className="w-3.5 h-3.5" />
        Generate AI root-cause summary
      </button>
    </div>
  );
}

// ─── Repo tabs ─────────────────────────────────────────────────────────────────

function RepoTabs({
  repos,
  selectedRepo,
  onSelect,
  repoPage,
  repoTotal,
  onPrevPage,
  onNextPage,
  isLoading,
}: {
  repos: ClusterRepoItem[];
  selectedRepo: string | null;
  onSelect: (repo: string) => void;
  repoPage: number;
  repoTotal: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  isLoading: boolean;
}) {
  const totalPages = Math.max(1, Math.ceil(repoTotal / REPO_PAGE_SIZE));

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-gray-400 py-2">
        <SpinnerIcon className="animate-spin w-3.5 h-3.5" /> Loading
        repositories…
      </div>
    );
  }

  if (repos.length === 0) {
    return (
      <p className="text-[12px] text-gray-400 py-2">
        No repository data for this cluster.
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1.5 flex-wrap flex-1">
        {repos.map((r) => (
          <button
            key={r.repo}
            onClick={() => onSelect(r.repo)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors ${
              selectedRepo === r.repo
                ? "bg-black text-white border-black"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            <span className="truncate max-w-[160px]">{r.repo}</span>
            <span
              className={`text-[10px] tabular-nums ${
                selectedRepo === r.repo ? "text-white/70" : "text-gray-400"
              }`}
            >
              {r.count}
            </span>
          </button>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onPrevPage}
            disabled={repoPage <= 1}
            className="w-6 h-6 flex items-center justify-center rounded-md border border-gray-200 text-gray-400 hover:text-black disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronIcon className="w-3 h-3 rotate-180" />
          </button>
          <span className="text-[11px] text-gray-400 tabular-nums px-1">
            {repoPage}/{totalPages}
          </span>
          <button
            onClick={onNextPage}
            disabled={repoPage >= totalPages}
            className="w-6 h-6 flex items-center justify-center rounded-md border border-gray-200 text-gray-400 hover:text-black disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronIcon className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Cluster Row (accordion item) ─────────────────────────────────────────────

function ClusterRow({
  cluster,
  isExpanded,
  onToggle,
  onSummarize,
  summaryState,
}: {
  cluster: ClusterSummary;
  isExpanded: boolean;
  onToggle: () => void;
  onSummarize: (clusterId: number) => void;
  summaryState: { loading: boolean; error: string | null; text: string | null };
}) {
  const total = cluster.openCount + cluster.closedCount;
  const openPct = total > 0 ? Math.round((cluster.openCount / total) * 100) : 0;

  // Repo tabs state
  const [repos, setRepos] = useState<ClusterRepoItem[]>([]);
  const [repoPage, setRepoPage] = useState(1);
  const [repoTotal, setRepoTotal] = useState(0);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [hasLoadedRepos, setHasLoadedRepos] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);

  // Issues state
  const [issues, setIssues] = useState<ClusterIssue[]>([]);
  const [issuePage, setIssuePage] = useState(1);
  const [issueTotal, setIssueTotal] = useState(0);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [issuesError, setIssuesError] = useState<string | null>(null);

  const fetchIssues = useCallback(
    async (repo: string, page: number) => {
      setLoadingIssues(true);
      setIssuesError(null);
      try {
        const token = getAccessTokenClient();
        const result = await getClusterRepoIssues(
          token,
          cluster.cluster_id,
          repo,
          page,
          ISSUE_PAGE_SIZE,
        );
        setIssues(result.data);
        setIssueTotal(result.total);
        setIssuePage(page);
      } catch {
        setIssuesError("Failed to load issues.");
      } finally {
        setLoadingIssues(false);
      }
    },
    [cluster.cluster_id],
  );

  const fetchRepos = useCallback(
    async (page: number) => {
      setLoadingRepos(true);
      try {
        const token = getAccessTokenClient();
        const result = await getClusterRepos(
          token,
          cluster.cluster_id,
          page,
          REPO_PAGE_SIZE,
        );
        setRepos(result.data);
        setRepoTotal(result.total);
        setRepoPage(page);
        const firstRepo = result.data[0]?.repo ?? null;
        setSelectedRepo(firstRepo);

        // Fetch issues for the first repo as a direct consequence of loading
        // repos, instead of via a reactive effect watching selectedRepo.
        if (firstRepo) {
          await fetchIssues(firstRepo, 1);
        } else {
          setIssues([]);
          setIssueTotal(0);
        }
      } catch {
        setRepos([]);
      } finally {
        setLoadingRepos(false);
        setHasLoadedRepos(true);
      }
    },
    [cluster.cluster_id, fetchIssues],
  );

  // Called directly from RepoTabs' onClick — repo selection is a user action,
  // so we fetch right here instead of reacting to a selectedRepo change.
  const handleSelectRepo = useCallback(
    (repo: string) => {
      setSelectedRepo(repo);
      fetchIssues(repo, 1);
    },
    [fetchIssues],
  );

  // Called when the header row is clicked to expand/collapse. Lazy-loads
  // repos on first expand — triggered directly by the user action instead
  // of a useEffect watching isExpanded.
  const handleToggleRow = useCallback(() => {
    if (!isExpanded && !hasLoadedRepos) {
      fetchRepos(1);
    }
    onToggle();
  }, [isExpanded, hasLoadedRepos, fetchRepos, onToggle]);

  function handleRepoPrev() {
    if (repoPage > 1) fetchRepos(repoPage - 1);
  }
  function handleRepoNext() {
    fetchRepos(repoPage + 1);
  }
  function handleIssuePrev() {
    if (selectedRepo && issuePage > 1) fetchIssues(selectedRepo, issuePage - 1);
  }
  function handleIssueNext() {
    if (selectedRepo) fetchIssues(selectedRepo, issuePage + 1);
  }

  const issueTotalPages = Math.max(1, Math.ceil(issueTotal / ISSUE_PAGE_SIZE));

  return (
    <div
      className={`border border-gray-100 rounded-xl overflow-hidden transition-all ${
        isExpanded ? "shadow-sm" : ""
      }`}
    >
      {/* ── Header row ── */}
      <button
        onClick={handleToggleRow}
        className="w-full flex items-center gap-4 px-5 py-4 bg-white hover:bg-gray-50/70 transition-colors text-left"
      >
        <ChevronIcon
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
        />
        <span className="flex-1 text-[14px] font-semibold text-gray-900 truncate">
          {cluster.cluster_label}
        </span>
        <span className="text-[12px] text-gray-400 font-medium shrink-0">
          {fmt(total)} issue{total !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
            {cluster.openCount} open
          </span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700">
            {cluster.closedCount} closed
          </span>
        </div>
        <div className="w-20 h-1.5 rounded-full bg-gray-100 overflow-hidden shrink-0">
          <div
            className="h-full bg-blue-400 rounded-full"
            style={{ width: `${openPct}%` }}
          />
        </div>
        <span className="text-[12px] text-gray-400 shrink-0 w-14 text-right">
          {resolutionRate(cluster.openCount, cluster.closedCount)} resolved
        </span>
      </button>

      {/* ── Expanded body ── */}
      {isExpanded && (
        <div className="border-t border-gray-100 bg-gray-50/30 px-5 py-4">
          {/* Repo tabs */}
          <div className="mb-3">
            <RepoTabs
              repos={repos}
              selectedRepo={selectedRepo}
              onSelect={handleSelectRepo}
              repoPage={repoPage}
              repoTotal={repoTotal}
              onPrevPage={handleRepoPrev}
              onNextPage={handleRepoNext}
              isLoading={loadingRepos}
            />
          </div>

          {/* Issues table for selected repo */}
          <div className="rounded-xl border border-gray-100 overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Title
                  </th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 w-[90px]">
                    State
                  </th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 w-[90px]">
                    Opened
                  </th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {loadingIssues ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="text-center py-8 text-[13px] text-gray-400"
                    >
                      <span className="inline-flex items-center gap-2">
                        <SpinnerIcon className="animate-spin w-3.5 h-3.5" />{" "}
                        Loading issues…
                      </span>
                    </td>
                  </tr>
                ) : issuesError ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="text-center py-8 text-[13px] text-red-500"
                    >
                      {issuesError}
                    </td>
                  </tr>
                ) : issues.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="text-center py-8 text-[13px] text-gray-400"
                    >
                      {selectedRepo
                        ? "No issues in this repository."
                        : "Select a repository to view its issues."}
                    </td>
                  </tr>
                ) : (
                  issues.map((issue, idx) => (
                    <tr
                      key={issue._id}
                      className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                        idx === issues.length - 1 ? "border-b-0" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <a
                          href={issue.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[13px] font-medium text-gray-800 hover:underline line-clamp-1"
                        >
                          {issue.title}
                        </a>
                      </td>

                      <td className="px-4 py-3">
                        <StateBadge state={issue.state} />
                      </td>

                      <td className="px-4 py-3 text-[12px] text-gray-400">
                        {daysAgo(issue.created_at)}
                      </td>

                      <td className="px-2 py-3">
                        <a
                          href={issue.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-300 hover:text-gray-500 transition-colors"
                        >
                          <ExternalLinkIcon className="w-3.5 h-3.5" />
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Issues pagination */}
            {issueTotal > ISSUE_PAGE_SIZE && (
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 bg-gray-50">
                <span className="text-[11px] text-gray-400">
                  Page {issuePage} of {issueTotalPages}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleIssuePrev}
                    disabled={issuePage <= 1}
                    className="px-2.5 py-1 rounded-md border border-gray-200 text-[11px] font-medium text-gray-500 hover:text-black disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={handleIssueNext}
                    disabled={issuePage >= issueTotalPages}
                    className="px-2.5 py-1 rounded-md border border-gray-200 text-[11px] font-medium text-gray-500 hover:text-black disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* AI Summary */}
          <AiSummaryBlock
            summary={summaryState.text ?? cluster.gemini_summary}
            loading={summaryState.loading}
            error={summaryState.error}
            onGenerate={() => onSummarize(cluster.cluster_id)}
          />
        </div>
      )}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center mb-4">
        <SparkleIcon className="w-6 h-6 text-violet-400" />
      </div>
      <p className="text-[15px] font-semibold text-gray-700">No clusters yet</p>
      <p className="text-[13px] text-gray-400 mt-1 max-w-xs">
        Run the clustering pipeline from the dashboard to group issues into
        problem domains.
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface AiInsightClientProps {
  initialClusters: ClusterSummary[];
  total: number;
  currentPage: number;
  initialSearch: string;
}

const CLUSTERS_PER_PAGE = 6;

export function AiInsightClient({
  initialClusters,
  total,
  currentPage,
  initialSearch,
}: AiInsightClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [search, setSearch] = useState(initialSearch);
  const debounceRef = useState<{
    current: ReturnType<typeof setTimeout> | null;
  }>({
    current: null,
  })[0];

  const [summaries, setSummaries] = useState<
    Record<
      number,
      { loading: boolean; error: string | null; text: string | null }
    >
  >({});

  const totalPages = Math.max(1, Math.ceil(total / CLUSTERS_PER_PAGE));

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    if (key !== "page") params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateParam("search", value);
    }, 300);
  }

  const handleToggle = useCallback((clusterId: number) => {
    setExpandedId((prev) => (prev === clusterId ? null : clusterId));
  }, []);

  const [clustering, setClustering] = useState<"idle" | "running" | "done">(
    "idle",
  );

  const API_BASE = "https://localhost";

  async function handleCluster() {
    setClustering("running");
    try {
      const token = await getAccessTokenClient();
      const res = await fetch(`${API_BASE}/issues/cluster`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Cluster request failed");
      setClustering("done");
    } catch {
      setClustering("idle");
    } finally {
      setTimeout(() => setClustering("idle"), 3000);
    }
  }

  const handleSummarize = useCallback(async (clusterId: number) => {
    setSummaries((prev) => ({
      ...prev,
      [clusterId]: { loading: true, error: null, text: null },
    }));
    try {
      const token = getAccessTokenClient();
      const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://localhost";
      const res = await fetch(
        `${API_BASE}/issues/clusters/${clusterId}/summarize`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      setSummaries((prev) => ({
        ...prev,
        [clusterId]: { loading: false, error: null, text: data.summary },
      }));
    } catch (err: unknown) {
      setSummaries((prev) => ({
        ...prev,
        [clusterId]: {
          loading: false,
          error: errorMessage(err, "Something went wrong"),
          text: null,
        },
      }));
    }
  }, []);

  const totalIssues = initialClusters.reduce(
    (s, c) => s + c.openCount + c.closedCount,
    0,
  );

  return (
    <div className="px-[100px] py-10 min-h-screen">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[18px] font-medium text-gray-900 tracking-tight">
            AI Insight
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            {total} problem domain{total !== 1 ? "s" : ""} on this page ·{" "}
            {fmt(totalIssues)} issues clustered
          </p>
        </div>
        <button
          onClick={handleCluster}
          disabled={clustering === "running"}
          className="flex items-center gap-1.5 text-[13px] font-medium px-4 py-2 rounded-lg
            border border-gray-200 bg-white hover:bg-gray-50 transition-colors
            disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
        >
          {clustering === "running"
            ? "Running…"
            : clustering === "done"
              ? "✓ Done"
              : "Run clustering"}
        </button>
      </div>

      {/* ── Summary strip ── */}
      {initialClusters.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            {
              label: "Clusters (this page)",
              value: initialClusters.length,
              color: "text-violet-700",
              bg: "bg-violet-50",
            },
            {
              label: "Open issues",
              value: fmt(initialClusters.reduce((s, c) => s + c.openCount, 0)),
              color: "text-blue-700",
              bg: "bg-blue-50",
            },
            {
              label: "Resolved",
              value: (() => {
                const closed = initialClusters.reduce(
                  (s, c) => s + c.closedCount,
                  0,
                );
                return resolutionRate(
                  initialClusters.reduce((s, c) => s + c.openCount, 0),
                  closed,
                );
              })(),
              color: "text-green-700",
              bg: "bg-green-50",
            },
          ].map((m) => (
            <div key={m.label} className={`${m.bg} rounded-xl px-5 py-4`}>
              <p className="text-[11px] uppercase tracking-wider text-gray-500 font-medium mb-1">
                {m.label}
              </p>
              <p className={`text-[26px] font-bold ${m.color}`}>{m.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Search (server-side) ── */}
      <div className="relative max-w-sm mb-5">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
        <input
          type="text"
          placeholder="Search clusters…"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm
            focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black transition-all"
        />
      </div>

      {/* ── Cluster list ── */}
      {initialClusters.length === 0 ? (
        search ? (
          <p className="text-[13px] text-gray-400 py-12 text-center">
            No clusters match &quot;{search}&quot;
          </p>
        ) : (
          <EmptyState />
        )
      ) : (
        <div className="flex flex-col gap-2">
          {initialClusters.map((cluster) => (
            <ClusterRow
              key={cluster.cluster_id}
              cluster={cluster}
              isExpanded={expandedId === cluster.cluster_id}
              onToggle={() => handleToggle(cluster.cluster_id)}
              onSummarize={handleSummarize}
              summaryState={
                summaries[cluster.cluster_id] ?? {
                  loading: false,
                  error: null,
                  text: null,
                }
              }
            />
          ))}
        </div>
      )}

      {/* ── Cluster pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <span className="text-sm text-gray-400">
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={currentPage <= 1}
              onClick={() => updateParam("page", String(currentPage - 1))}
              className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              ← Previous
            </button>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => updateParam("page", String(currentPage + 1))}
              className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}
