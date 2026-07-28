// app/(client)/issues/IssuesClient.tsx
"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { getGithubAuthUrl, syncIssues } from "@/services/ingestion.service";
import type { Issue } from "@/types/issue.type";

import { useCallback, useEffect, useRef } from "react";
import { searchIssuesSemantic } from "@/services/issues.service";
import { getAccessTokenClient } from "@/lib/getAccessToken.client";
import { RepoFilter } from "./RepoFilter";

interface Props {
  initialIssues: Issue[];
  total: number;
  currentPage: number;
  initialState: "open" | "closed" | "all";
  initialSearch: string;
  initialRepos: string[]; // ← added
}

const ITEMS_PER_PAGE = 20;

export function IssuesClient({
  initialIssues,
  total,
  currentPage,
  initialState,
  initialSearch,
  initialRepos, // ← added
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [semanticResults, setSemanticResults] = useState<Issue[] | null>(null);
  const [semanticTotal, setSemanticTotal] = useState<number>(0);
  const [searchMode, setSearchMode] = useState<"hybrid" | "text-only" | null>(
    null,
  );
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [issues] = useState<Issue[]>(initialIssues);
  const [search, setSearch] = useState(initialSearch);
  const [stateFilter, setStateFilter] = useState<"open" | "closed" | "all">(
    initialState,
  );
  const [selectedRepos, setSelectedRepos] = useState<string[]>(initialRepos);
  const [token, setToken] = useState<string>("");
  const [syncStatus, setSyncStatus] = useState<
    "idle" | "syncing" | "done" | "error"
  >("idle");
  const [syncMessage, setSyncMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  // Fetch a client-side token once, for RepoFilter's own requests
  useEffect(() => {
    try {
      setToken(getAccessTokenClient());
    } catch {
      // ignore — token stays empty, RepoFilter can handle that state
    }
  }, []);

  useEffect(() => {
    if (searchParams.get("github") === "connected") {
      handleSync(); // reuses your existing sync logic + success/error messaging
      const params = new URLSearchParams(searchParams.toString());
      params.delete("github");
      router.replace(`${pathname}?${params.toString()}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key); // ← avoid leaving "repos=" or "search=" empty in the URL
    }
    if (key !== "page") params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  }

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (!value.trim()) {
        setSemanticResults(null);
        setSemanticTotal(0);
        setSearchMode(null);
        updateParam("search", "");
        return;
      }

      debounceRef.current = setTimeout(async () => {
        setIsSearching(true);
        try {
          const clientToken = await getAccessTokenClient();
          const result = await searchIssuesSemantic(
            clientToken,
            value,
            1,
            stateFilter,
          );
          setSemanticResults(result.data as any);
          setSemanticTotal(result.total);
          setSearchMode(result.mode);
        } catch {
          // fall through — keep showing last results
        } finally {
          setIsSearching(false);
        }
      }, 300);
    },
    [stateFilter],
  );

  // Clear stale semantic results if the state filter changes mid-search
  useEffect(() => {
    if (semanticResults !== null && search.trim()) {
      handleSearchChange(search);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateFilter]);

  function handleReposChange(repos: string[]) {
    setSelectedRepos(repos);
    updateParam("repos", repos.join(","));
  }

  // Derive which issues + total to display:
  const displayIssues = semanticResults ?? initialIssues;
  const displayTotal = semanticResults !== null ? semanticTotal : total;

  async function handleSync() {
    setSyncStatus("syncing");
    setSyncMessage("");
    try {
      await syncIssues();
      setSyncStatus("done");
      setSyncMessage(`issues synced`);
      setTimeout(() => setSyncMessage(""), 3000);
      router.refresh();
    } catch (err: any) {
      if (err.message === "GITHUB_NOT_CONNECTED") {
        const { url } = await getGithubAuthUrl("/issues"); // ← added
        window.location.href = url;
        return;
      }
      setSyncStatus("error");
      setSyncMessage(
        err.message === "UNAUTHORIZED"
          ? "You must be logged in."
          : "Sync failed. Try again.",
      );
    } finally {
      setTimeout(() => {
        setSyncStatus("idle");
        setSyncMessage("");
      }, 3000);
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <div className="px-[100px] py-10 min-h-screen">
      {/* ── Page Header ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[18px] font-medium text-gray-900 tracking-tight">
            Issues
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            {total} issues pulled from your GitHub account
          </p>
        </div>

        <div className="flex items-center gap-3">
          {syncMessage && (
            <span
              className={`text-sm font-medium ${
                syncStatus === "error" ? "text-red-500" : "text-green-600"
              }`}
            >
              {syncMessage}
            </span>
          )}
          <button
            onClick={handleSync}
            disabled={syncStatus === "syncing" || isPending}
            className="flex items-center gap-2 bg-black text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {syncStatus === "syncing" ? (
              <>
                <Spinner />
                Syncing…
              </>
            ) : (
              <>
                <SyncIcon />
                Sync Issues
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Filters ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 mb-6">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search issues..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              updateParam("search", e.target.value);
            }}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black transition-all"
          />
        </div>
        {/* State filter */}
        <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-1">
          {(["all", "open", "closed"] as const).map((s) => (
            <button
              key={s}
              onClick={() => {
                setStateFilter(s);
                updateParam("state", s);
              }}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-all ${
                stateFilter === s
                  ? "bg-white shadow-sm text-black"
                  : "text-gray-500 hover:text-black"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        {/* Repository filter */}
        <RepoFilter
          token={token}
          selectedRepos={selectedRepos}
          onChange={handleReposChange}
        />{" "}
        {/* Result count */}
        <span className="text-sm text-gray-400 ml-auto">
          {total} result{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Search mode indicator */}
      {semanticResults !== null && (
        <div className="flex items-center gap-2 mb-3 text-xs text-gray-400">
          {isSearching ? (
            <>
              <Spinner /> Searching…
            </>
          ) : (
            <>
              <span
                className={`w-1.5 h-1.5 rounded-full ${searchMode === "hybrid" ? "bg-indigo-400" : "bg-gray-400"}`}
              />
              {searchMode === "hybrid"
                ? "Semantic + keyword search"
                : "Keyword search only"}
              · {displayTotal} result{displayTotal !== 1 ? "s" : ""}
            </>
          )}
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────────────── */}
      <div className="border border-gray-200 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-5 py-3 font-semibold text-gray-600">
                Title
              </th>
              <th className="text-left px-3 py-3 font-semibold text-gray-600 w-[370px]">
                Repository
              </th>

              <th className="text-left px-5 py-3 font-semibold text-gray-600 w-[100px]">
                State
              </th>
              {semanticResults !== null && (
                <th className="text-left px-5 py-3 font-semibold text-gray-600 w-[90px]">
                  Score
                </th>
              )}
              <th className="text-left px-5 py-3 font-semibold text-gray-600 w-[130px]">
                Opened
              </th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600 w-[130px]">
                Updated
              </th>
              <th className="w-[60px]" />
            </tr>
          </thead>
          <tbody>
            {initialIssues.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-16 text-gray-400">
                  {search || stateFilter !== "all" || selectedRepos.length > 0
                    ? "No issues match your filters."
                    : `No issues yet. Click "Sync Issues" to pull from GitHub.`}
                </td>
              </tr>
            ) : (
              displayIssues.map((issue: any, idx) => (
                <tr
                  key={issue._id ?? issue.issueId}
                  className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                    idx === displayIssues.length - 1 ? "border-b-0" : ""
                  }`}
                >
                  {/* Title + quality badges */}
                  <td className="px-5 py-4">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0">
                        <a
                          href={issue.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-gray-900 hover:underline line-clamp-1"
                        >
                          {issue.title}
                        </a>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 mt-0.5">
                        {issue.isPoorlyDescribed && (
                          <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[10px] font-semibold">
                            Poorly described
                          </span>
                        )}

                        {issue.isNoise && !issue.isPoorlyDescribed && (
                          <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 border border-gray-200 rounded text-[10px] font-semibold">
                            Unclassified
                          </span>
                        )}

                        {issue.cluster_label &&
                          !issue.isPoorlyDescribed &&
                          !issue.isNoise && (
                            <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded text-[10px] font-medium">
                              {issue.cluster_label}
                            </span>
                          )}
                      </div>
                    </div>
                  </td>

                  {/* Repository */}
                  <td className="px-5 py-4 text-gray-500">
                    {issue.repo ?? "—"}
                  </td>

                  <td className="px-5 py-4">
                    <StateBadge state={issue.state} />
                  </td>

                  {semanticResults !== null && (
                    <td className="px-5 py-4 w-[90px]">
                      {issue.similarity_score !== null ? (
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden w-10">
                            <div
                              className="h-full bg-indigo-500 rounded-full"
                              style={{
                                width: `${issue.similarity_score * 100}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 tabular-nums">
                            {Math.round(issue.similarity_score * 100)}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">
                          text match
                        </span>
                      )}
                    </td>
                  )}

                  <td className="px-5 py-4 text-gray-500">
                    {formatDate(issue.created_at)}
                  </td>

                  <td className="px-5 py-4 text-gray-500">
                    {formatDate(issue.created_at)}
                  </td>

                  <td className="px-3 py-4">
                    <a
                      href={issue.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-300 hover:text-gray-600 transition-colors"
                    >
                      <ExternalLinkIcon />
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ────────────────────────────────────────────────── */}
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

// ── Small components ───────────────────────────────────────────────────────

function StateBadge({ state }: { state: string }) {
  const isOpen = state === "open";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
        isOpen ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          isOpen ? "bg-green-500" : "bg-gray-400"
        }`}
      />
      {isOpen ? "Open" : "Closed"}
    </span>
  );
}

function SyncIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
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

function ExternalLinkIcon() {
  return (
    <svg
      width="14"
      height="14"
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

function Spinner() {
  return (
    <svg
      className="animate-spin"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
