import type { Issue } from "@/types/issue.type";
import { PriorityBadge } from "./PriorityBadge";
import { LabelBadge } from "./LabelBadge";

interface Props {
  issues: Issue[];
}

export function IssuesTable({ issues }: Props) {
  if (issues.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-gray-400">
        No issues found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            {["Issue", "Priority", "Labels", "Freq.", "Assignee", "Last seen"].map(
              (h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap"
                >
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>

        <tbody className="bg-white divide-y divide-gray-100">
          {issues.map((issue) => (
            <tr
              key={issue.issueId}
              className="hover:bg-gray-50 transition-colors"
            >
              {/* Issue title + repo + state */}
              <td className="px-4 py-3 max-w-sm">
                <div className="flex items-start gap-2">
                  <span
                    className={`mt-0.5 text-base leading-none flex-shrink-0 ${
                      issue.state === "closed"
                        ? "text-gray-400"
                        : "text-emerald-500"
                    }`}
                  >
                    {issue.state === "closed" ? "✓" : "●"}
                  </span>
                  <div className="min-w-0">
                    <p
                      className={`font-medium truncate ${
                        issue.state === "closed"
                          ? "text-gray-400"
                          : "text-gray-900"
                      }`}
                    >
                      {issue.title}
                    </p>
                    {issue.repo && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {issue.repo}
                      </p>
                    )}
                  </div>
                </div>
              </td>

              {/* Priority */}
              <td className="px-4 py-3 whitespace-nowrap">
                <PriorityBadge priority={issue.priority} />
              </td>

              {/* Labels */}
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {issue.labels?.map((l) => (
                    <LabelBadge key={l} label={l} />
                  ))}
                </div>
              </td>

              {/* Frequency */}
              <td className="px-4 py-3 text-center whitespace-nowrap">
                {issue.frequency && issue.frequency > 0 ? (
                  <span
                    className={`font-semibold ${
                      issue.frequency > 10 ? "text-red-600" : "text-gray-700"
                    }`}
                  >
                    {issue.frequency}×
                  </span>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </td>

              {/* Assignee */}
              <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                {issue.assignee ?? "—"}
              </td>

              {/* Last seen */}
              <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                {issue.lastOccurrence ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}