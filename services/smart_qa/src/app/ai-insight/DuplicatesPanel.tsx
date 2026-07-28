"use client";

import { useEffect, useState } from "react";
import { getDuplicateIssues } from "@/services/issues.service";
import { DuplicateGroup } from "@/types/issue.type";

const ISSUES_PAGE_SIZE = 5;

function daysAgo(dateStr: string | null) {
  if (!dateStr) return "—";
  const d = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  return d === 0 ? "today" : d === 1 ? "1d ago" : `${d}d ago`;
}

function StateDot({ state }: { state: string }) {
  return (
    <span
      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
        state === "open" ? "bg-blue-500" : "bg-gray-400"
      }`}
    />
  );
}

function SimilarityBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone =
    pct >= 95
      ? "bg-red-50 text-red-700"
      : pct >= 90
        ? "bg-amber-50 text-amber-800"
        : "bg-yellow-50 text-yellow-800";
  return (
    <span
      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${tone}`}
    >
      {pct}% similar
    </span>
  );
}

function RepoTag({ repo }: { repo: string | null }) {
  if (!repo) return null;
  return (
    <span
      className="text-[10px] font-medium text-gray-400 bg-gray-50 border border-gray-100 rounded px-1.5 py-0.5 shrink-0 truncate max-w-[110px]"
      title={repo}
    >
      {repo}
    </span>
  );
}

function GroupCard({ group }: { group: DuplicateGroup }) {
  const [visibleCount, setVisibleCount] = useState(ISSUES_PAGE_SIZE);

  const visibleIssues = group.issues.slice(0, visibleCount);
  const hasMore = visibleCount < group.issues.length;

  return (
    <div className="border border-gray-100 rounded-xl bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-[12px] font-medium text-gray-500 truncate max-w-[60%]"
          title={group.cluster_label}
        >
          {group.cluster_label}
        </span>
        <SimilarityBadge value={group.maxSimilarity} />
      </div>
      <div className="flex flex-col divide-y divide-gray-50">
        {visibleIssues.map((issue) => (
          <div key={issue._id} className="flex items-center gap-2.5 py-2">
            <StateDot state={issue.state} />

            <RepoTag repo={issue.repo} />

            <a
              href={issue.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 truncate text-[13px] text-gray-800 hover:underline"
              title={issue.title}
            >
              {issue.title}
            </a>

            <span className="shrink-0 text-[11px] text-gray-400">
              {daysAgo(issue.created_at)}
            </span>
          </div>
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => setVisibleCount((c) => c + ISSUES_PAGE_SIZE)}
          className="w-full mt-2 py-1.5 text-[12px] font-medium text-gray-500 hover:text-black hover:bg-gray-50 rounded-lg transition-colors"
        >
          Show 5 more ({group.issues.length - visibleCount} remaining)
        </button>
      )}
    </div>
  );
}

export function DuplicatesPanel() {
  const [groups, setGroups] = useState<DuplicateGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDuplicateIssues()
      .then((res) => setGroups(res.duplicateGroups))
      .catch((err) => setError(err.message ?? "Something went wrong"));
  }, []);

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          Possible duplicates
        </p>
        {groups && (
          <span className="text-[12px] text-gray-400">
            {groups.length} group{groups.length !== 1 ? "s" : ""} flagged
          </span>
        )}
      </div>

      {error ? (
        <p className="text-[13px] text-red-500 py-6 text-center">{error}</p>
      ) : groups === null ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-20 bg-gray-50 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <p className="text-[13px] text-gray-400 py-6 text-center">
          No likely duplicates found — issues are well differentiated.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {groups.map((g) => (
            <GroupCard key={g.groupId} group={g} />
          ))}
        </div>
      )}
    </div>
  );
}
