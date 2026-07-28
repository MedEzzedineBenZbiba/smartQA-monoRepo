"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useCallback, useEffect } from "react";
import { syncIssues } from "@/services/ingestion.service";

// ── Types ──────────────────────────────────────────────────────────────────

interface Repo {
  name: string;
  fullName: string;
  description: string | null;
  url: string;
  isPrivate: boolean;
}

interface SyncJob {
  id: string;
  repoName: string;
  orgName: string;
  repoUrl: string;
  frequency: "1h" | "6h" | "12h" | "24h";
  status: "active" | "paused" | "syncing" | "failed";
  lastSyncedAt: string | null;
  nextSyncAt: string;
  issueCount: number;
}

interface Props {
  initialConnected: boolean;
  initialRepos: Repo[];
  initialSyncJobs: SyncJob[];
  githubAuthUrl: string;
  orgName: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const d = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (d < 1) return "Just now";
  if (d < 60) return `${d}m ago`;
  if (d < 1440) return `${Math.floor(d / 60)}h ago`;
  return `${Math.floor(d / 1440)}d ago`;
}

function freqLabel(f: string): string {
  const map: Record<string, string> = {
    "1h": "Every hour",
    "6h": "Every 6 hours",
    "12h": "Every 12 hours",
    "24h": "Every 24 hours",
  };
  return map[f] ?? f;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: SyncJob["status"] }) {
  const styles: Record<SyncJob["status"], string> = {
    active: "bg-green-50 text-green-700",
    syncing: "bg-blue-50 text-blue-700",
    paused: "bg-gray-100 text-gray-500",
    failed: "bg-red-50 text-red-700",
  };
  return (
    <span
      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${styles[status]}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function AddSyncModal({
  repo,
  orgName,
  onConfirm,
  onClose,
}: {
  repo: Repo;
  orgName: string;
  onConfirm: (
    repoName: string,
    orgName: string,
    repoUrl: string,
    frequency: string,
  ) => Promise<void>;
  onClose: () => void;
}) {
  const [frequency, setFrequency] = useState("6h");
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    await onConfirm(repo.name, orgName, repo.url, frequency);
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h3 className="text-[15px] font-semibold text-gray-900 mb-1">
          Add sync job
        </h3>
        <p className="text-[13px] text-gray-400 mb-5">{repo.fullName}</p>

        <p className="text-[12px] font-medium text-gray-600 mb-2">
          Sync frequency
        </p>
        <div className="grid grid-cols-2 gap-2 mb-6">
          {["1h", "6h", "12h", "24h"].map((f) => (
            <button
              key={f}
              onClick={() => setFrequency(f)}
              className={`py-2 rounded-lg text-[13px] font-medium border transition-colors ${
                frequency === f
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 text-gray-700 hover:bg-gray-50"
              }`}
            >
              {freqLabel(f)}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-gray-200 text-[13px]
              font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 py-2 rounded-lg bg-gray-900 text-white text-[13px]
              font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {loading ? "Creating…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function QaReposClient({
  initialConnected,
  initialRepos,
  initialSyncJobs,
  githubAuthUrl,
  orgName,
}: Props) {
  const [connected] = useState(initialConnected);
  const [repos] = useState<Repo[]>(initialRepos);
  const [syncJobs, setSyncJobs] = useState<SyncJob[]>(initialSyncJobs);
  const [modalRepo, setModalRepo] = useState<Repo | null>(null);
  const [loadingJobId, setLoadingJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();

  // Repos that already have a sync job
  const syncedRepoNames = new Set(syncJobs.map((j) => j.repoName));

  // ── Sync job actions ────────────────────────────────────────────────────

  const handleCreateSyncJob = useCallback(
    async (
      repoName: string,
      org: string,
      repoUrl: string,
      frequency: string,
    ) => {
      setError(null);
      try {
        const res = await fetch("/api/ingestion/sync-jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repoName, orgName: org, repoUrl, frequency }),
        });
        if (!res.ok) throw new Error("Failed to create sync job");
        const newJob = await res.json();
        setSyncJobs((prev) => [newJob, ...prev]);
        setModalRepo(null);
      } catch (err: any) {
        setError(err.message ?? "Something went wrong");
      }
    },
    [],
  );

  const handlePause = useCallback(async (id: string) => {
    setLoadingJobId(id);
    setError(null);
    try {
      const res = await fetch(`/api/ingestion/sync-jobs/${id}/pause`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to pause");
      setSyncJobs((prev) =>
        prev.map((j) => (j.id === id ? { ...j, status: "paused" } : j)),
      );
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    } finally {
      setLoadingJobId(null);
    }
  }, []);

  const handleResume = useCallback(async (id: string) => {
    setLoadingJobId(id);
    setError(null);
    try {
      const res = await fetch(`/api/ingestion/sync-jobs/${id}/resume`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to resume");
      setSyncJobs((prev) =>
        prev.map((j) => (j.id === id ? { ...j, status: "active" } : j)),
      );
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    } finally {
      setLoadingJobId(null);
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    setLoadingJobId(id);
    setError(null);
    try {
      const res = await fetch(`/api/ingestion/sync-jobs/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      setSyncJobs((prev) => prev.filter((j) => j.id !== id));
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    } finally {
      setLoadingJobId(null);
    }
  }, []);

  useEffect(() => {
    if (searchParams.get("github") === "connected") {
      syncIssues()
        .then(() => {
          router.replace("/qa-repos"); // strip the query param
          router.refresh();
        })
        .catch(() => {
          router.replace("/qa-repos");
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <main className="px-6 md:px-12 xl:px-24 mt-8 pb-16 space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-[22px] font-semibold text-gray-900">
          Repository Sync
        </h1>
        <p className="text-[13px] text-gray-400 mt-0.5">
          Connect your GitHub organization and schedule issue ingestion.
        </p>
      </div>

      {error && (
        <div
          className="bg-red-50 border border-red-100 text-red-700
          text-[13px] px-4 py-3 rounded-xl"
        >
          {error}
        </div>
      )}

      {/* Section 1 — GitHub connection status */}
      <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
        <p
          className="text-[11px] font-semibold uppercase tracking-wider
          text-gray-400 mb-4"
        >
          GitHub Connection
        </p>

        {connected ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-50">
                <CheckIcon className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-[14px] font-medium text-gray-900">
                  Connected to <span className="font-semibold">{orgName}</span>
                </p>
                <p className="text-[12px] text-gray-400">
                  GitHub organization linked successfully
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
                <GithubIcon className="h-4 w-4 text-gray-500" />
              </div>
              <div>
                <p className="text-[14px] font-medium text-gray-900">
                  Not connected
                </p>
                <p className="text-[12px] text-gray-400">
                  Connect your GitHub account to start syncing repos
                </p>
              </div>
            </div>

            <a
              href={githubAuthUrl}
              className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-gray-800"
            >
              <GithubIcon className="h-4 w-4" />
              Connect GitHub
            </a>
          </div>
        )}
      </div>

      {/* Section 2 — Org repos (only when connected) */}
      {connected && (
        <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
          <p
            className="text-[11px] font-semibold uppercase tracking-wider
            text-gray-400 mb-4"
          >
            Organization Repositories
          </p>

          {repos.length === 0 ? (
            <p className="text-[13px] text-gray-400 text-center py-8">
              No repositories found in this organization.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {repos.map((repo) => {
                const isSyncing = syncedRepoNames.has(repo.name);
                return (
                  <div
                    key={repo.fullName}
                    className="border border-gray-100 rounded-xl p-4
                      flex flex-col gap-2 hover:border-gray-200 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <RepoIcon className="w-4 h-4 text-gray-400 shrink-0" />
                        <span
                          className="text-[13px] font-semibold
                          text-gray-900 truncate"
                        >
                          {repo.name}
                        </span>
                      </div>
                      {repo.isPrivate && (
                        <span
                          className="text-[10px] font-medium px-1.5
                          py-0.5 rounded bg-gray-100 text-gray-500 shrink-0"
                        >
                          Private
                        </span>
                      )}
                    </div>

                    {repo.description && (
                      <p className="text-[12px] text-gray-400 line-clamp-2">
                        {repo.description}
                      </p>
                    )}

                    <div className="mt-auto pt-2">
                      {isSyncing ? (
                        <span
                          className="text-[11px] font-medium px-2.5
                          py-1 rounded-lg bg-green-50 text-green-700"
                        >
                          ✓ Syncing
                        </span>
                      ) : (
                        <button
                          onClick={() => setModalRepo(repo)}
                          className="text-[12px] font-medium px-3 py-1.5
                            rounded-lg border border-gray-200 text-gray-700
                            hover:bg-gray-50 transition-colors"
                        >
                          + Add sync
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Section 3 — Active sync jobs */}
      {connected && (
        <div
          className="bg-white border border-gray-100 rounded-xl
          overflow-hidden shadow-sm"
        >
          <div className="px-5 py-4 border-b border-gray-100">
            <p
              className="text-[11px] font-semibold uppercase tracking-wider
              text-gray-400"
            >
              Active Sync Jobs
            </p>
          </div>

          {syncJobs.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-[13px] text-gray-400">
                No sync jobs yet — add one from the repo list above.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th
                      className="text-left px-5 py-3 text-[11px] font-semibold
                      uppercase tracking-wider text-gray-400"
                    >
                      Repository
                    </th>
                    <th
                      className="text-left px-5 py-3 text-[11px] font-semibold
                      uppercase tracking-wider text-gray-400"
                    >
                      Frequency
                    </th>
                    <th
                      className="text-left px-5 py-3 text-[11px] font-semibold
                      uppercase tracking-wider text-gray-400"
                    >
                      Status
                    </th>
                    <th
                      className="text-left px-5 py-3 text-[11px] font-semibold
                      uppercase tracking-wider text-gray-400"
                    >
                      Last synced
                    </th>
                    <th
                      className="text-left px-5 py-3 text-[11px] font-semibold
                      uppercase tracking-wider text-gray-400"
                    >
                      Issues
                    </th>
                    <th className="w-[120px]" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {syncJobs.map((job) => (
                    <tr
                      key={job.id}
                      className="hover:bg-gray-50/60 transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <div>
                          <p className="text-[13px] font-medium text-gray-900">
                            {job.repoName}
                          </p>
                          <p className="text-[11px] text-gray-400">
                            {job.orgName}
                          </p>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-[12px] text-gray-600">
                        {freqLabel(job.frequency)}
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="px-5 py-3.5 text-[12px] text-gray-400">
                        {timeAgo(job.lastSyncedAt)}
                      </td>
                      <td className="px-5 py-3.5 text-[12px] text-gray-600 font-medium">
                        {job.issueCount.toLocaleString()}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5 justify-end">
                          {job.status === "paused" ? (
                            <button
                              onClick={() => handleResume(job.id)}
                              disabled={loadingJobId === job.id}
                              className="text-[11px] font-medium px-2.5 py-1
                                rounded-lg border border-gray-200 text-gray-700
                                hover:bg-gray-50 transition-colors
                                disabled:opacity-40"
                            >
                              Resume
                            </button>
                          ) : (
                            <button
                              onClick={() => handlePause(job.id)}
                              disabled={
                                loadingJobId === job.id ||
                                job.status === "syncing"
                              }
                              className="text-[11px] font-medium px-2.5 py-1
                                rounded-lg border border-gray-200 text-gray-700
                                hover:bg-gray-50 transition-colors
                                disabled:opacity-40"
                            >
                              Pause
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(job.id)}
                            disabled={loadingJobId === job.id}
                            className="text-[11px] font-medium px-2.5 py-1
                              rounded-lg border border-red-100 text-red-600
                              hover:bg-red-50 transition-colors
                              disabled:opacity-40"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add sync modal */}
      {modalRepo && (
        <AddSyncModal
          repo={modalRepo}
          orgName={orgName}
          onConfirm={handleCreateSyncJob}
          onClose={() => setModalRepo(null)}
        />
      )}
    </main>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────

function CheckIcon({ className }: { className?: string }) {
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
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425
        2.865 8.18 6.839 9.504.5.092.682-.217.682-.483
        0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608
        1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341
        1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951
        0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65
        0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12
        6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296
        2.747-1.027 2.747-1.027.546 1.379.202 2.398.1
        2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339
        4.695-4.566 4.943.359.309.678.92.678 1.855 0
        1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02
        10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  );
}

function RepoIcon({ className }: { className?: string }) {
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
      <path
        d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3
        0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35
        0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8
        0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403
        5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68
        1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"
      />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}
