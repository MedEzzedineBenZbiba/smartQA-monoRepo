// types/qa-dashboard.interface.ts
export interface QualityTrendPoint {
  period: string; // e.g. "2026-W23" (ISO week)
  poorlyDescribed: number;
  noise: number;
}

export interface AgingBucket {
  bucket: '0-7' | '7-30' | '30+';
  count: number;
}

export interface OldestOpenIssue {
  _id: string;
  issueId: string;
  title: string;
  created_at: Date | null;
  daysOpen: number;
}

export interface QADashboardStats {
  total: number;
  poorlyDescribed: number;
  noise: number;
  clustered: number;
  resolutionRate: number; // % of clustered issues that are closed
  qualityTrend: QualityTrendPoint[];
  agingBuckets: AgingBucket[];
  oldestOpenIssues: OldestOpenIssue[]; // top 6, for the bar chart
}
