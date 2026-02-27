import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { KRStatus } from "@shared/schema";

interface StatusBadgeProps {
  status: KRStatus | null | undefined;
  className?: string;
}

const statusStyles: Record<string, { bg: string; text: string }> = {
  "On Track": {
    bg: "bg-green-100 dark:bg-green-900/30",
    text: "text-green-700 dark:text-green-400"
  },
  "At Risk": {
    bg: "bg-yellow-100 dark:bg-yellow-900/30",
    text: "text-yellow-700 dark:text-yellow-400"
  },
  "Behind": {
    bg: "bg-red-100 dark:bg-red-900/30",
    text: "text-red-700 dark:text-red-400"
  },
};

/**
 * Renders a colored status badge for OKR key results.
 * - On Track: Green
 * - At Risk: Yellow
 * - Behind: Red
 */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  if (!status) {
    return (
      <span className="text-xs text-muted-foreground">-</span>
    );
  }

  const style = statusStyles[status] || {
    bg: "bg-gray-100 dark:bg-gray-800",
    text: "text-gray-700 dark:text-gray-300"
  };

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs font-medium border-0 px-2 py-0.5",
        style.bg,
        style.text,
        className
      )}
    >
      {status}
    </Badge>
  );
}
