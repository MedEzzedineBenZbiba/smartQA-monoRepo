import type { IssuePriority } from "@/types/issue.type";

const styles: Record<
  IssuePriority,
  { dot: string; badge: string }
> = {
  critical: { dot: "bg-red-500",    badge: "bg-red-50    text-red-800"    },
  high:     { dot: "bg-amber-400",  badge: "bg-amber-50  text-amber-800"  },
  medium:   { dot: "bg-blue-400",   badge: "bg-blue-50   text-blue-800"   },
  low:      { dot: "bg-green-400",  badge: "bg-green-50  text-green-800"  },
};

export function PriorityBadge({ priority }: { priority?: IssuePriority }) {
  if (!priority) return null;
  const s = styles[priority] ?? styles.medium;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${s.badge}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {priority}
    </span>
  );
}