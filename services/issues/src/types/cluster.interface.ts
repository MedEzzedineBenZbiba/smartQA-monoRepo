// ─── Add this to your shared types file (e.g. src/types/issue.type.ts) ────────
// Or create a new file: src/issues/interfaces/cluster.interface.ts

export interface ClusterIssueItem {
  _id: string;
  issueId: string;
  title: string;
  state: 'open' | 'closed';
  created_at: string | null;
  url: string;
}

export interface ClusterWithIssues {
  cluster_id: number;
  cluster_label: string;
  openCount: number;
  closedCount: number;
  issues: ClusterIssueItem[];
  gemini_summary: string | null;
}

// Existing ClusterIssue interface stays as-is, reused by the new issues endpoint.
export interface ClusterIssue {
  _id: string;
  issueId: string;
  title: string;
  state: 'open' | 'closed';
  created_at: string | null;
  url: string;
}

// New — lightweight cluster metadata, no embedded issues anymore
export interface ClusterSummary {
  cluster_id: number;
  cluster_label: string;
  openCount: number;
  closedCount: number;
  gemini_summary: string | null;
}

// New — distinct repo + issue count within a cluster
export interface ClusterRepoItem {
  repo: string;
  count: number;
}
