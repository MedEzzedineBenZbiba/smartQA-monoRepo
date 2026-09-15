// app/(client)/issues/RepoFilter.tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getRepos } from "@/services/issues.service";

interface RepoFilterProps {
  token: string;
  selectedRepos: string[];
  onChange: (repos: string[]) => void;
}

interface RepoItem {
  repo: string;
  count: number;
}

const PAGE_SIZE = 20;

export function RepoFilter({
  token,
  selectedRepos,
  onChange,
}: RepoFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [repos, setRepos] = useState<RepoItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchRepos = useCallback(
    async (searchTerm: string, pageNum: number, append: boolean) => {
      if (append) setIsLoadingMore(true);
      else setIsLoading(true);
      setError("");

      try {
        const result = await getRepos(searchTerm, pageNum, PAGE_SIZE);
        setRepos((prev) => (append ? [...prev, ...result.data] : result.data));
        setTotal(result.total);
        setPage(pageNum);
      } catch {
        setError("Failed to load repositories.");
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
        setHasLoadedOnce(true);
      }
    },
    [token],
  );

  // Load first page the first time the dropdown opens.
  // Deferred to a microtask so the setState calls inside fetchRepos don't
  // run synchronously in the effect body.
  useEffect(() => {
    if (isOpen && !hasLoadedOnce) {
      queueMicrotask(() => fetchRepos("", 1, false));
    }
  }, [isOpen, hasLoadedOnce, fetchRepos]);

  function handleSearchChange(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchRepos(value, 1, false);
    }, 300);
  }

  function handleLoadMore() {
    fetchRepos(search, page + 1, true);
  }

  function toggleRepo(repo: string) {
    const next = selectedRepos.includes(repo)
      ? selectedRepos.filter((r) => r !== repo)
      : [...selectedRepos, repo];
    onChange(next);
  }

  function clearAll() {
    onChange([]);
  }

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const hasMore = repos.length < total;

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen((o) => !o)}
        className={`flex items-center gap-2 px-4 py-2 border rounded-xl text-sm font-medium transition-all ${
          selectedRepos.length > 0
            ? "border-black bg-black text-white"
            : "border-gray-200 text-gray-600 hover:bg-gray-50"
        }`}
      >
        <RepoIcon />
        Repositories
        {selectedRepos.length > 0 && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold bg-white/20">
            {selectedRepos.length}
          </span>
        )}
        <ChevronIcon
          className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-2 w-80 bg-white border border-gray-200 rounded-2xl shadow-lg overflow-hidden">
          {/* Search */}
          <div className="p-3 border-b border-gray-100">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                autoFocus
                placeholder="Search repositories..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black transition-all"
              />
            </div>
          </div>

          {/* Selected count + clear */}
          {selectedRepos.length > 0 && (
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
              <span className="text-xs text-gray-500">
                {selectedRepos.length} selected
              </span>
              <button
                onClick={clearAll}
                className="text-xs font-medium text-gray-500 hover:text-black transition-colors"
              >
                Clear all
              </button>
            </div>
          )}

          {/* List */}
          <div className="max-h-72 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400">
                <Spinner /> Loading...
              </div>
            ) : error ? (
              <div className="py-8 text-center text-sm text-red-500">
                {error}
              </div>
            ) : repos.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">
                No repositories found.
              </div>
            ) : (
              <ul>
                {repos.map((r) => {
                  const checked = selectedRepos.includes(r.repo);
                  return (
                    <li key={r.repo}>
                      <label className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRepo(r.repo)}
                          className="sr-only"
                        />
                        <span
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                            checked
                              ? "bg-black border-black"
                              : "border-gray-300 bg-white"
                          }`}
                        >
                          {checked && <CheckIcon />}
                        </span>
                        <span className="flex-1 text-sm text-gray-800 truncate">
                          {r.repo}
                        </span>
                        <span className="text-xs text-gray-400 tabular-nums">
                          {r.count}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}

            {!isLoading && hasMore && (
              <button
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="w-full py-2.5 text-sm font-medium text-gray-500 hover:text-black hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {isLoadingMore ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner /> Loading...
                  </span>
                ) : (
                  `Load more (${repos.length}/${total})`
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Small components (mirrors IssuesClient.tsx style) ──────────────────────

function RepoIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
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

function CheckIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
