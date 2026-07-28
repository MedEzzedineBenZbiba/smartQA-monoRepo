"use client";

import {
  QADashboardStats,
  AgingBucket,
  OldestOpenIssue,
} from "@/types/issue.type";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from "recharts";

// ─── helpers ────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
}
function pct(a: number, b: number) {
  return b === 0 ? "0%" : Math.round((a / b) * 100) + "%";
}
function shortLabel(label: string, max = 18) {
  return label.length > max ? label.slice(0, max) + "…" : label;
}
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
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
      <p className="text-[11px] uppercase tracking-wider text-gray-400 mb-1">
        {label}
      </p>
      <p className={`text-[22px] font-medium ${colorClass}`}>{value}</p>
    </div>
  );
}

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

// ─── main component ──────────────────────────────────────────────────────────
export function QADashboard({ stats }: { stats: QADashboardStats }) {
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
