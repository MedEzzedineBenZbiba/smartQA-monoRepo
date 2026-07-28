export interface DuplicateIssueItem {
  _id: string;
  issueId: string;
  title: string;
  state: 'open' | 'closed';
  url: string;
  created_at: string | null;
  repo: string | null; // ← added
}

export interface DuplicateGroup {
  groupId: string;
  cluster_id: number;
  cluster_label: string;
  maxSimilarity: number;
  issues: DuplicateIssueItem[];
}
