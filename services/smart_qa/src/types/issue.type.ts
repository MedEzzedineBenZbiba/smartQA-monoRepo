export type IssueState = "open" | "closed";
export type IssuePriority = "critical" | "high" | "medium" | "low";
export type IssueLabel = "bug" | "enhancement" | "security" | string;

export interface Issue {
  _id: string;
  issueId: number;
  number?: number;
  title: string;
  body?: string;
  state: IssueState;
  url: string;
  userId: string;
  repo?: string;
  labels?: IssueLabel[];
  priority?: IssuePriority;
  assignee?: string;
  created_at: string;
  updated_at: string;
}

export interface PaginatedIssues {
  data: Issue[];
  page: number;
  limit: number;
  total: number;
}

export interface RecentIssue {
  _id: string;
  title: string;
  state: "open" | "closed";
  cluster_id: number | null;
  cluster_label: string | null;
  created_at: string | null;
  isPoorlyDescribed: boolean;
  isNoise: boolean;
}

export interface ClusterBucket {
  cluster_id: number;
  cluster_label: string;
  openCount: number;
  closedCount: number;
}

export interface IssueDashboardStats {
  total: number;
  open: number;
  closed: number;
  clustered: number;
  noise: number;
  poorlyDescribed: number;
  clusterDistribution: ClusterBucket[];
  recentIssues: RecentIssue[];
}

// types/issue.type.ts — add these

export interface QualityTrendPoint {
  period: string; // ISO week, e.g. "2026-W23"
  poorlyDescribed: number;
  noise: number;
}

export interface AgingBucket {
  bucket: "0-7" | "7-30" | "30+";
  count: number;
}

export interface OldestOpenIssue {
  _id: string;
  issueId: string;
  title: string;
  created_at: string | null;
  daysOpen: number;
}

export interface QADashboardStats {
  total: number;
  poorlyDescribed: number;
  noise: number;
  clustered: number;
  resolutionRate: number; // already a %, e.g. 72
  qualityTrend: QualityTrendPoint[];
  agingBuckets: AgingBucket[];
  oldestOpenIssues: OldestOpenIssue[];
}

export interface DuplicateIssueItem {
  _id: string;
  issueId: string;
  title: string;
  state: "open" | "closed";
  url: string;
  created_at: string | null;
}

// export interface DuplicateGroup {
//   groupId: string;
//   cluster_id: number;
//   cluster_label: string;
//   maxSimilarity: number;
//   issues: DuplicateIssueItem[];
// }

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatCitation {
  id: string;
  issueId: string;
  title: string;
  url: string;
}

export interface ChatResponse {
  answer: string;
  citations: ChatCitation[];
}

export interface DuplicateGroup {
  groupId: string;
  cluster_id: number;
  cluster_label: string;
  maxSimilarity: number;
  issues: {
    _id: string;
    issueId: string;
    title: string;
    state: "open" | "closed";
    url: string;
    created_at: string | null;
    repo: string | null; // ← added
  }[];
}
