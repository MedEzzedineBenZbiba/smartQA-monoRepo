export interface KafkaIssuePayload {
  issue: {
    id: string | number;
    number?: number;
    pull_request?: unknown;
    state: string;
    updated_at: Date | string;
    title: string;
    body?: string | null;
    created_at: Date | string;
    userId: string;
    url: string;
  };
}
