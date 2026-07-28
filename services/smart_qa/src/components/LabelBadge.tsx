const labelStyle: Record<string, string> = {
  bug:         "bg-red-50   text-red-800",
  enhancement: "bg-green-50 text-green-800",
  security:    "bg-amber-50 text-amber-800",
};

const fallback = "bg-gray-100 text-gray-700";

export function LabelBadge({ label }: { label: string }) {
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${labelStyle[label] ?? fallback}`}
    >
      {label}
    </span>
  );
}