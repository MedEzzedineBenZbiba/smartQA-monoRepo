"use client";

import { useEffect, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { getDashboardStats, getRecentHires } from "@/services/users.service";
import { Employee, DashboardStats } from "@/types/employee.type";
import { useAuthStore } from "@/stores/useAuthStore";
import {
  IssueDashboardStats,
  ClusterBucket,
  RecentIssue,
  QADashboardStats,
  AgingBucket,
  OldestOpenIssue,
} from "@/types/issue.type";

import {
  getIssuesDashboardStats,
  getQADashboardStats,
} from "@/services/issues.service";

// ─── constants ────────────────────────────────────────────────────────────────

const API_BASE = "http://localhost:8003";

const ROLE_COLORS: Record<string, { bg: string; text: string; label: string }> =
  {
    softwareDev: { bg: "#eaf3de", text: "#3b6d11", label: "Software engineer" },
    teamLead: { bg: "#e6f1fb", text: "#185fa5", label: "Tech lead" },
    QA: { bg: "#faeeda", text: "#854f0b", label: "QA" },
  };

const PIE_COLORS = ["#4a7a2e", "#8ab86e", "#c5ddb0"];
const GENDER_COLORS = ["#185fa5", "#e05fa0", "#9ca3af"];

const BUCKET_LABELS: Record<AgingBucket["bucket"], string> = {
  "0-7": "0–7 days",
  "7-30": "7–30 days",
  "30+": "30+ days",
};
const BUCKET_COLORS: Record<AgingBucket["bucket"], string> = {
  "0-7": "#378add",
  "7-30": "#d97706",
  "30+": "#dc2626",
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

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

// ─── shared skeleton / error ──────────────────────────────────────────────────

function ChartSkeleton() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <div className="h-4 w-32 bg-gray-200 animate-pulse rounded mb-6" />
      <div className="h-48 bg-gray-100 animate-pulse rounded" />
    </div>
  );
}

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <main className="px-6 md:px-12 xl:px-24 mt-10">
      <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center max-w-md mx-auto shadow-sm">
        <p className="text-red-600 font-semibold">
          Failed to load dashboard data
        </p>
        <p className="text-red-400 text-sm mt-1 mb-4">{message}</p>
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium text-sm rounded-lg transition-colors"
        >
          Retry connection
        </button>
      </div>
    </main>
  );
}

// ─── admin sub-components ─────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  loading,
}: {
  label: string;
  value: number | string;
  sub: string;
  loading: boolean;
}) {
  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5 transition-all hover:shadow-md">
      <p className="text-xs font-semibold tracking-wider uppercase text-gray-400 mb-1">
        {label}
      </p>
      {loading ? (
        <div className="h-8 w-16 bg-gray-200 animate-pulse rounded mt-2" />
      ) : (
        <p className="text-3xl font-bold tracking-tight text-gray-900 mt-1">
          {value}
        </p>
      )}
      <p className="text-xs text-gray-500 mt-2 font-medium">{sub}</p>
    </div>
  );
}

// ─── SE sub-components ────────────────────────────────────────────────────────

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
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
      <p className="text-[11px] uppercase tracking-wider text-gray-400 mb-1">
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
          className="text-[13px] font-medium text-gray-800 truncate max-w-[55%]"
          title={bucket.cluster_label}
        >
          {bucket.cluster_label}
        </span>
        <span className="text-[11px] flex gap-3">
          <span className="text-[#185fa5] font-medium">
            {bucket.openCount} open
          </span>
          <span className="text-[#3b6d11] font-medium">
            {bucket.closedCount} closed
          </span>
        </span>
      </div>
      <div className="h-[5px] rounded-full bg-gray-100 overflow-hidden flex">
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
      <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-red-50 text-red-800 shrink-0">
        Poorly described
      </span>
    );
  if (issue.isNoise)
    return (
      <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-amber-50 text-amber-900 shrink-0">
        Noise
      </span>
    );
  if (issue.cluster_label)
    return (
      <span
        className="text-[10px] font-medium px-2 py-0.5 rounded bg-violet-50 text-violet-900 shrink-0 max-w-[160px] truncate"
        title={issue.cluster_label}
      >
        {shortLabel(issue.cluster_label, 24)}
      </span>
    );
  return null;
}

function SESkeleton() {
  return (
    <main className="px-6 md:px-12 xl:px-24 mt-8 pb-16 space-y-4">
      <div className="h-6 w-48 bg-gray-200 animate-pulse rounded" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-gray-100 rounded-lg p-4 h-20 animate-pulse"
          />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
      <div className="bg-white border border-gray-100 rounded-xl p-5">
        <div className="h-4 w-32 bg-gray-200 animate-pulse rounded mb-4" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 bg-gray-50 animate-pulse rounded my-2" />
        ))}
      </div>
    </main>
  );
}

// ─── SE dashboard ─────────────────────────────────────────────────────────────

function SEDashboard({ stats }: { stats: IssueDashboardStats }) {
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
    name: shortLabel(c.cluster_label, 16),
    Open: c.openCount,
    Closed: c.closedCount,
  }));

  async function handleCluster() {
    setClustering("running");
    try {
      const res = await fetch(`${API_BASE}/issues/cluster`, { method: "POST" });
      if (!res.ok) throw new Error("Cluster request failed");
      setClustering("done");
    } catch {
      setClustering("idle");
    } finally {
      setTimeout(() => setClustering("idle"), 3000);
    }
  }

  return (
    <main className="px-6 md:px-12 xl:px-24 mt-8 pb-16 space-y-4">
      {/* top bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[18px] font-medium text-gray-900">
            Issue intelligence
          </h1>
          <p className="text-[13px] text-gray-400 mt-0.5">
            {fmt(stats.total)} issues · {stats.clusterDistribution.length}{" "}
            active clusters
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

      {/* metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <MetricCard
          label="Total"
          value={fmt(stats.total)}
          colorClass="text-gray-900"
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

      {/* cluster dist + quality */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-4">
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

        <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-4">
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
                className="bg-gray-50 rounded-lg p-3 border border-gray-100"
              >
                <p className="text-[11px] text-gray-400 mb-1">{q.label}</p>
                <p className={`text-[20px] font-medium ${q.color}`}>{q.val}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{q.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* recent issues */}
      <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
        <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-4">
          Recent issues{" "}
          <span className="normal-case font-normal tracking-normal text-[11px]">
            — last 20
          </span>
        </p>
        <div className="flex flex-col divide-y divide-gray-50">
          {stats.recentIssues.map((issue) => (
            <div key={issue._id} className="flex items-center gap-2.5 py-2.5">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  issue.state === "open" ? "bg-[#378add]" : "bg-[#639922]"
                }`}
              />
              <span
                className="flex-1 text-[13px] text-gray-800 truncate"
                title={issue.title}
              >
                {issue.title}
              </span>
              <IssueBadge issue={issue} />
              <span className="text-[11px] text-gray-400 shrink-0 min-w-[52px] text-right">
                {daysAgo(issue.created_at)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* open vs closed bar chart */}
      {chartData.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-3">
            Open vs closed per cluster
          </p>
          <div className="flex gap-4 mb-4 text-[12px] text-gray-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#378add] inline-block" />
              Open
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#639922] inline-block" />
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
                tick={{ fontSize: 11, fill: "#9ca3af" }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "#9ca3af" }}
              />
              <Tooltip cursor={{ fill: "rgba(0,0,0,0.03)" }} />
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

// ─── QA sub-components ────────────────────────────────────────────────────────

function AgingBar({ bucket }: { bucket: AgingBucket }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 border border-gray-100 text-center">
      <p className="text-[11px] text-gray-400 mb-1">
        {BUCKET_LABELS[bucket.bucket]}
      </p>
      <p
        className="text-[26px] font-semibold"
        style={{ color: BUCKET_COLORS[bucket.bucket] }}
      >
        {bucket.count}
      </p>
    </div>
  );
}

// ─── QA dashboard ─────────────────────────────────────────────────────────────

function QADashboard({ stats }: { stats: QADashboardStats }) {
  const oldestChartData = [...stats.oldestOpenIssues]
    .sort((a, b) => b.daysOpen - a.daysOpen)
    .map((i: OldestOpenIssue) => ({
      issueId: i.issueId,
      title: i.title,
      daysOpen: i.daysOpen,
    }));

  const trendData = stats.qualityTrend.map((t) => ({
    period: t.period.replace(/^\d{4}-W/, "W"),
    "Poorly described": t.poorlyDescribed,
    Noise: t.noise,
  }));

  return (
    <main className="px-6 md:px-12 xl:px-24 mt-8 pb-16 space-y-4">
      {/* top bar */}
      <div>
        <h1 className="text-[18px] font-medium text-gray-900">
          Quality health
        </h1>
        <p className="text-[13px] text-gray-400 mt-0.5">
          {fmt(stats.total)} issues tracked across the backlog
        </p>
      </div>

      {/* metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <MetricCard
          label="Total"
          value={fmt(stats.total)}
          colorClass="text-gray-900"
        />
        <MetricCard
          label="Poorly described"
          value={fmt(stats.poorlyDescribed)}
          colorClass="text-[#a32d2d]"
        />
        <MetricCard
          label="Noise"
          value={fmt(stats.noise)}
          colorClass="text-[#854f0b]"
        />
        <MetricCard
          label="Resolution rate"
          value={`${stats.resolutionRate}%`}
          colorClass="text-[#3b6d11]"
        />
      </div>

      {/* trend + aging buckets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-4">
            Poorly described &amp; noise — last 8 weeks
          </p>
          {trendData.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">
              No issues created in this window yet.
            </p>
          ) : (
            <>
              <div className="flex gap-4 mb-3 text-[12px] text-gray-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#a32d2d] inline-block" />
                  Poorly described
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#854f0b] inline-block" />
                  Noise
                </span>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart
                  data={trendData}
                  margin={{ top: 4, right: 8, left: 0, bottom: 8 }}
                >
                  <CartesianGrid
                    vertical={false}
                    strokeDasharray="3 3"
                    stroke="#f3f4f6"
                  />
                  <XAxis
                    dataKey="period"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "#9ca3af" }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "#9ca3af" }}
                  />
                  <Tooltip />
                  <Legend wrapperStyle={{ display: "none" }} />
                  <Line
                    type="monotone"
                    dataKey="Poorly described"
                    stroke="#a32d2d"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="Noise"
                    stroke="#854f0b"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </>
          )}
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-4">
            Open issue aging
          </p>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {stats.agingBuckets.map((b) => (
              <AgingBar key={b.bucket} bucket={b} />
            ))}
          </div>
          <p className="text-[11px] text-gray-400">
            {pct(
              stats.agingBuckets.find((b) => b.bucket === "30+")?.count ?? 0,
              stats.agingBuckets.reduce((s, b) => s + b.count, 0),
            )}{" "}
            of open issues have been stale for 30+ days.
          </p>
        </div>
      </div>

      {/* oldest open issues chart */}
      <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
        <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1">
          Top critical backlog
        </p>
        <p className="text-[12px] text-gray-400 mb-4">
          Oldest open issues remaining unresolved
        </p>
        {oldestChartData.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">
            No open issues to display.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={oldestChartData}
              margin={{ top: 20, right: 10, left: 0, bottom: 10 }}
            >
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
                stroke="#f3f4f6"
              />
              <XAxis
                dataKey="issueId"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "#9ca3af" }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                label={{
                  value: "Days open",
                  angle: -90,
                  position: "insideLeft",
                  offset: 10,
                  style: { fill: "#9ca3af", fontSize: 11 },
                }}
              />
              <Tooltip
                cursor={{ fill: "#f9fafb" }}
                formatter={(value: any, _name, item: any) => [
                  `${value} days`,
                  item?.payload?.title ?? "Days open",
                ]}
              />
              <Bar
                dataKey="daysOpen"
                fill="#ef4444"
                radius={[6, 6, 0, 0]}
                maxBarSize={50}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </main>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const session = useAuthStore((s) => s.session);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);

  // ── admin state ────────────────────────────────────────────────────────────
  const [adminStats, setAdminStats] = useState<DashboardStats | null>(null);
  const [recent, setRecent] = useState<Employee[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  // ── SE state ───────────────────────────────────────────────────────────────
  const [seStats, setSeStats] = useState<IssueDashboardStats | null>(null);
  const [seLoading, setSeLoading] = useState(false);
  const [seError, setSeError] = useState<string | null>(null);

  // ── QA state ───────────────────────────────────────────────────────────────
  const [qaStats, setQaStats] = useState<QADashboardStats | null>(null);
  const [qaLoading, setQaLoading] = useState(false);
  const [qaError, setQaError] = useState<string | null>(null);

  const isAdmin = session?.role.includes("superadmin");
  const isSE = session?.role.includes("Software engineer");
  const isQA = session?.role.includes("QA");

  // ── fetch: admin ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return;
    setAdminLoading(true);
    setAdminError(null);

    Promise.all([getDashboardStats(), getRecentHires()])
      .then(([statsRes, usersRes]) => {
        if (!statsRes || !usersRes)
          throw new Error("Failed to populate dashboard entries");
        setAdminStats(statsRes);
        setRecent(usersRes);
      })
      .catch((err: any) => setAdminError(err.message ?? "Something went wrong"))
      .finally(() => setAdminLoading(false));
  }, [isAdmin]);

  // ── fetch: SE ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSE) return;

    setSeLoading(true);
    setSeError(null);

    getIssuesDashboardStats()
      .then((data) => {
        if (!data) throw new Error("Failed to fetch dashboard stats");
        setSeStats(data);
      })
      .catch((err: any) => {
        setSeError(err?.message ?? "Something went wrong");
      })
      .finally(() => {
        setSeLoading(false);
      });
  }, [hasHydrated, isSE]);

  // ── fetch: QA ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isQA) return;

    setQaLoading(true);
    setQaError(null);

    getQADashboardStats()
      .then((data) => {
        if (!data) throw new Error("Failed to fetch QA dashboard stats");
        setQaStats(data);
      })
      .catch((err: any) => {
        setQaError(err?.message ?? "Something went wrong");
      })
      .finally(() => {
        setQaLoading(false);
      });
  }, [hasHydrated, isQA]);

  // ── admin view ─────────────────────────────────────────────────────────────
  if (isAdmin) {
    if (adminError)
      return (
        <ErrorBanner
          message={adminError}
          onRetry={() => window.location.reload()}
        />
      );

    const roleData = adminStats
      ? Object.entries(adminStats.byRole).map(([key, value]) => ({
          name: ROLE_COLORS[key]?.label ?? key,
          value,
        }))
      : [];
    const genderData = adminStats
      ? [
          { name: "Male", value: adminStats.byGender.male },
          { name: "Female", value: adminStats.byGender.female },
        ].filter((g) => g.value > 0)
      : [];
    const total = adminStats?.total ?? 0;

    return (
      <main className="px-6 md:px-12 xl:px-24 mt-8 pb-16 space-y-6">
        {/* metric cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total employees"
            value={total}
            sub="Across all organizational units"
            loading={adminLoading}
          />
          <StatCard
            label="Software engineers"
            value={adminStats?.byRole["Software engineer"] ?? 0}
            sub={
              total > 0
                ? `${Math.round(((adminStats?.byRole["Software engineer"] ?? 0) / total) * 100)}% of total team`
                : "—"
            }
            loading={adminLoading}
          />
          <StatCard
            label="Tech leads"
            value={adminStats?.byRole["Team lead"] ?? 0}
            sub={
              total > 0
                ? `${Math.round(((adminStats?.byRole["Team lead"] ?? 0) / total) * 100)}% of total team`
                : "—"
            }
            loading={adminLoading}
          />
          <StatCard
            label="QA engineers"
            value={adminStats?.byRole["QA"] ?? 0}
            sub={
              total > 0
                ? `${Math.round(((adminStats?.byRole["QA"] ?? 0) / total) * 100)}% of total team`
                : "—"
            }
            loading={adminLoading}
          />
        </div>

        {/* charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {adminLoading ? (
            <ChartSkeleton />
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col justify-between">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                Role distribution
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                <div className="w-44 h-44 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={roleData}
                        innerRadius={55}
                        outerRadius={75}
                        dataKey="value"
                        paddingAngle={3}
                      >
                        {roleData.map((_, i) => (
                          <Cell
                            key={i}
                            fill={PIE_COLORS[i % PIE_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 w-full space-y-2.5">
                  {roleData.map((entry, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-sm text-gray-600 border-b border-gray-50 pb-1.5"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{
                            background: PIE_COLORS[i % PIE_COLORS.length],
                          }}
                        />
                        <span className="font-medium text-gray-700">
                          {entry.name}
                        </span>
                      </div>
                      <span className="font-bold text-gray-900">
                        {entry.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {adminLoading ? (
            <ChartSkeleton />
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col justify-between">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                Gender distribution
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                <div className="w-44 h-44 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={genderData}
                        innerRadius={55}
                        outerRadius={75}
                        dataKey="value"
                        paddingAngle={3}
                      >
                        {genderData.map((_, i) => (
                          <Cell
                            key={i}
                            fill={GENDER_COLORS[i % GENDER_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 w-full grid grid-cols-2 gap-4">
                  {genderData.map((entry, i) => (
                    <div
                      key={i}
                      className="bg-gray-50 rounded-lg p-3 border border-gray-100"
                    >
                      <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{
                            background: GENDER_COLORS[i % GENDER_COLORS.length],
                          }}
                        />
                        {entry.name}
                      </div>
                      <p className="text-2xl font-bold text-gray-900 mt-1">
                        {entry.value}
                      </p>
                      <p className="text-xs text-gray-400 font-medium mt-0.5">
                        {Math.round(
                          (entry.value /
                            genderData.reduce((s, g) => s + g.value, 0)) *
                            100,
                        )}
                        % of team
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* probationary employees table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Probationary employees — Last 3 months
            </h2>
          </div>
          {adminLoading ? (
            <div className="divide-y divide-gray-100">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-6 py-4 flex items-center gap-4">
                  <div className="w-9 h-9 rounded-full bg-gray-200 animate-pulse" />
                  <div className="space-y-2 flex-1">
                    <div className="h-3 w-32 bg-gray-200 animate-pulse rounded" />
                    <div className="h-2.5 w-48 bg-gray-100 animate-pulse rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : recent.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-gray-400 font-medium">
                No onboarding tracking logs found
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-gray-100 text-xs font-semibold uppercase text-gray-400 bg-gray-50/20">
                    <th className="px-6 py-3">Employee details</th>
                    <th className="px-6 py-3">System role</th>
                    <th className="px-6 py-3">Gender context</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {recent.map((emp, i) => {
                    const roleStyle = ROLE_COLORS[emp.role];
                    return (
                      <tr
                        key={emp.id ?? i}
                        className="hover:bg-gray-50/80 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                              style={{
                                background: roleStyle?.bg ?? "#f3f4f6",
                                color: roleStyle?.text ?? "#374151",
                              }}
                            >
                              {initials(emp.username)}
                            </div>
                            <div>
                              <p className="text-gray-900 font-semibold">
                                {emp.username}
                              </p>
                              <p className="text-gray-400 text-xs font-medium">
                                {emp.email}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className="text-xs font-semibold px-2.5 py-1 rounded-md"
                            style={{
                              background: roleStyle?.bg ?? "#f3f4f6",
                              color: roleStyle?.text ?? "#374151",
                            }}
                          >
                            {roleStyle?.label ?? emp.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-500 font-medium capitalize text-xs">
                          {emp.gender ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    );
  }

  // ── SE view ────────────────────────────────────────────────────────────────
  if (isSE) {
    if (seError)
      return (
        <ErrorBanner
          message={seError}
          onRetry={() => window.location.reload()}
        />
      );
    if (seLoading || !seStats) return <SESkeleton />;
    return <SEDashboard stats={seStats} />;
  }

  // ── QA view ────────────────────────────────────────────────────────────────
  if (isQA) {
    if (qaError)
      return (
        <ErrorBanner
          message={qaError}
          onRetry={() => window.location.reload()}
        />
      );
    if (qaLoading || !qaStats) return <SESkeleton />;
    return <QADashboard stats={qaStats} />;
  }

  // ── no matching role ───────────────────────────────────────────────────────
  return null;
}
