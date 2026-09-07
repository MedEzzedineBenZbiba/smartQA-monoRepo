import type { Issue } from "@/types/issue.type";
import type { SearchedIssue } from "@/services/issues.service";

export function isPoorlyDescribed(issue: Issue) {
  return issue.embedding == null;
}

export function isNoise(issue: Issue) {
  // Poorly described issues never reach clustering, so guard against a
  // false "noise" read on an issue that simply hasn't been embedded yet.
  return !isPoorlyDescribed(issue) && issue.cluster_id === -1;
}

/**
 * Table rows can be either a plain `Issue` (client must derive quality flags
 * from `embedding`/`cluster_id`) or a `SearchedIssue` (the search endpoint
 * already computed `isPoorlyDescribed`/`isNoise` server-side — trust it,
 * since search results don't carry `embedding` at all).
 */
export function getIssueQuality(issue: Issue | SearchedIssue) {
  if ("isPoorlyDescribed" in issue) {
    return { poorlyDescribed: issue.isPoorlyDescribed, noise: issue.isNoise };
  }
  return {
    poorlyDescribed: isPoorlyDescribed(issue),
    noise: isNoise(issue),
  };
}
