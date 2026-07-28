"use client";

import { useState, useRef, useEffect } from "react";
import {
  IssueDashboardStats,
  ClusterBucket,
  RecentIssue,
} from "@/types/issue.type";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

// ─── helpers ────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
}
function pct(a: number, b: number) {
  return b === 0 ? "0%" : Math.round((a / b) * 100) + "%";
}
function daysAgo(dateStr: string | null) {
  if (!dateStr) return "—";
  const d = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  return d === 0 ? "today" : d === 1 ? "1d ago" : `${d}d ago`;
}
function shortLabel(label: string, max = 22) {
  return label.length > max ? label.slice(0, max) + "…" : label;
}

// ─── sub-components ─────────────────────────────────────────────────────────
function MetricCard({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: string;
  colorClass: string;
}) {
  return (
    <div className="bg-[var(--color-background-secondary)] rounded-lg p-4">
      <p className="text-[11px] uppercase tracking-wider text-[var(--color-text-secondary)] mb-1">
        {label}
      </p>
      <p className={`text-[22px] font-medium ${colorClass}`}>{value}</p>
    </div>
  );
}

function ClusterBar({ bucket }: { bucket: ClusterBucket }) {
  const tot = bucket.openCount + bucket.closedCount;
  const openW = tot > 0 ? Math.round((bucket.openCount / tot) * 100) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-baseline">
        <span
          className="text-[13px] font-medium text-[var(--color-text-primary)] truncate max-w-[55%]"
          title={bucket.cluster_label}
        >
          {bucket.cluster_label}
        </span>
        <span className="text-[11px] flex gap-2">
          <span className="text-[#185fa5] font-medium">
            {bucket.openCount} open
          </span>
          <span className="text-[#3b6d11] font-medium">
            {bucket.closedCount} closed
          </span>
        </span>
      </div>
      <div className="h-[5px] rounded-full bg-[var(--color-background-secondary)] overflow-hidden flex">
        <div className="bg-[#378add] h-full" style={{ width: `${openW}%` }} />
        <div
          className="bg-[#639922] h-full"
          style={{ width: `${100 - openW}%` }}
        />
      </div>
    </div>
  );
}

function IssueBadge({ issue }: { issue: RecentIssue }) {
  if (issue.isPoorlyDescribed)
    return (
      <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-[#fcebeb] text-[#791f1f]">
        Poorly described
      </span>
    );
  if (issue.isNoise)
    return (
      <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-[#faeeda] text-[#633806]">
        Noise
      </span>
    );
  if (issue.cluster_label)
    return (
      <span
        className="text-[10px] font-medium px-2 py-0.5 rounded bg-[#eeedfe] text-[#3c3489] truncate max-w-[160px]"
        title={issue.cluster_label}
      >
        {shortLabel(issue.cluster_label, 24)}
      </span>
    );
  return null;
}

// ─── main component ──────────────────────────────────────────────────────────
export function SEDashboard({ stats }: { stats: IssueDashboardStats }) {
  const [clustering, setClustering] = useState<"idle" | "running" | "done">(
    "idle",
  );

  const goodClosed = stats.clusterDistribution.reduce(
    (s, c) => s + c.closedCount,
    0,
  );
  const goodTotal = stats.clusterDistribution.reduce(
    (s, c) => s + c.openCount + c.closedCount,
    0,
  );

  const sortedClusters = [...stats.clusterDistribution].sort(
    (a, b) => b.openCount + b.closedCount - (a.openCount + a.closedCount),
  );

  const chartData = sortedClusters.map((c) => ({
    name: shortLabel(c.cluster_label, 18),
    Open: c.openCount,
    Closed: c.closedCount,
  }));

  async function handleCluster() {
    setClustering("running");
    try {
      await fetch("/api/issues/cluster", { method: "POST" });
      setClustering("done");
    } catch {
      setClustering("idle");
    } finally {
      setTimeout(() => setClustering("idle"), 3000);
    }
  }

  return (
    <main className="px-6 md:px-12 xl:px-24 mt-8 pb-16 space-y-4">
      {/* ── top bar ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[18px] font-medium text-[var(--color-text-primary)]">
            Issue intelligence
          </h1>
          <p className="text-[13px] text-[var(--color-text-secondary)] mt-0.5">
            {fmt(stats.total)} issues · {stats.clusterDistribution.length}{" "}
            active clusters
          </p>
        </div>
        <button
          onClick={handleCluster}
          disabled={clustering === "running"}
          className="flex items-center gap-1.5 text-[13px] font-medium px-4 py-2
            rounded-lg border border-[var(--color-border-secondary)]
            bg-white hover:bg-gray-50 transition-colors disabled:opacity-60"
        >
          {clustering === "running"
            ? "Running…"
            : clustering === "done"
              ? "✓ Done"
              : "Run clustering"}
        </button>
      </div>

      {/* ── metric cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <MetricCard
          label="Total"
          value={fmt(stats.total)}
          colorClass="text-[var(--color-text-primary)]"
        />
        <MetricCard
          label="Open"
          value={fmt(stats.open)}
          colorClass="text-[#185fa5]"
        />
        <MetricCard
          label="Closed"
          value={fmt(stats.closed)}
          colorClass="text-[#3b6d11]"
        />
        <MetricCard
          label="Clustered"
          value={fmt(stats.clustered)}
          colorClass="text-[#534ab7]"
        />
        <MetricCard
          label="Noise"
          value={fmt(stats.noise)}
          colorClass="text-[#854f0b]"
        />
        <MetricCard
          label="Poorly described"
          value={fmt(stats.poorlyDescribed)}
          colorClass="text-[#a32d2d]"
        />
      </div>

      {/* ── cluster dist + quality ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-100 rounded-xl p-5">
          <p className="text-[12px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)] mb-4">
            Cluster distribution
          </p>
          {sortedClusters.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">
              No clusters yet — run clustering to populate.
            </p>
          ) : (
            <div className="flex flex-col gap-3 max-h-[280px] overflow-y-auto pr-1">
              {sortedClusters.map((c) => (
                <ClusterBar key={c.cluster_id} bucket={c} />
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-5">
          <p className="text-[12px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)] mb-4">
            Data quality
          </p>
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                label: "Clustered",
                val: fmt(stats.clustered),
                sub: pct(stats.clustered, stats.total) + " of total",
                color: "text-[#534ab7]",
              },
              {
                label: "Noise",
                val: fmt(stats.noise),
                sub: pct(stats.noise, stats.total) + " of total",
                color: "text-[#854f0b]",
              },
              {
                label: "Poorly described",
                val: fmt(stats.poorlyDescribed),
                sub: pct(stats.poorlyDescribed, stats.total) + " of total",
                color: "text-[#a32d2d]",
              },
              {
                label: "Resolution rate",
                val: pct(goodClosed, goodTotal),
                sub: "of clustered issues closed",
                color: "text-[#3b6d11]",
              },
            ].map((q) => (
              <div
                key={q.label}
                className="bg-[var(--color-background-secondary)] rounded-lg p-3"
              >
                <p className="text-[11px] text-[var(--color-text-secondary)] mb-1">
                  {q.label}
                </p>
                <p className={`text-[20px] font-medium ${q.color}`}>{q.val}</p>
                <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">
                  {q.sub}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── recent issues ── */}
      <div className="bg-white border border-gray-100 rounded-xl p-5">
        <p className="text-[12px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)] mb-4">
          Recent issues{" "}
          <span className="normal-case font-normal tracking-normal text-[11px]">
            — last 20
          </span>
        </p>
        <div className="flex flex-col divide-y divide-[var(--color-border-tertiary)]">
          {stats.recentIssues.map((issue) => (
            <div key={issue._id} className="flex items-center gap-2.5 py-2.5">
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${issue.state === "open" ? "bg-[#378add]" : "bg-[#639922]"}`}
              />
              <span
                className="flex-1 text-[13px] text-[var(--color-text-primary)] truncate"
                title={issue.title}
              >
                {issue.title}
              </span>
              <IssueBadge issue={issue} />
              <span className="text-[11px] text-[var(--color-text-secondary)] flex-shrink-0 min-w-[52px] text-right">
                {daysAgo(issue.created_at)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── cluster chart ── */}
      {chartData.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl p-5">
          <p className="text-[12px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)] mb-4">
            Open vs closed per cluster
          </p>
          <div className="flex gap-4 mb-4 text-[12px] text-[var(--color-text-secondary)]">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#378add]" />
              Open
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#639922]" />
              Closed
            </span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={chartData}
              margin={{ top: 4, right: 8, left: 0, bottom: 8 }}
            >
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
                stroke="#f3f4f6"
              />
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "#888" }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "#888" }}
              />
              <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} />
              <Legend wrapperStyle={{ display: "none" }} />
              <Bar
                dataKey="Open"
                fill="#378add"
                radius={[4, 4, 0, 0]}
                maxBarSize={24}
              />
              <Bar
                dataKey="Closed"
                fill="#639922"
                radius={[4, 4, 0, 0]}
                maxBarSize={24}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </main>
  );
}
