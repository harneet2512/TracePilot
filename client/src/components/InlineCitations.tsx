import { cn } from "@/lib/utils";

interface InlineCitationsProps {
  ids: number[];
  onCitationClick?: (id: number) => void;
  className?: string;
}

/**
 * Renders clickable citation markers like [1][2] that scroll to evidence.
 * Used for inline references to sources within OKR cards.
 */
export function InlineCitations({
  ids,
  onCitationClick,
  className
}: InlineCitationsProps) {
  if (!ids || ids.length === 0) return null;

  return (
    <span className={cn("inline-flex gap-0.5 ml-1", className)}>
      {ids.map(id => (
        <button
          key={id}
          onClick={(e) => {
            e.stopPropagation();
            onCitationClick?.(id);
          }}
          className="font-mono text-[11px] text-primary hover:text-primary/80 hover:underline cursor-pointer bg-primary/10 px-1 rounded transition-colors"
          title={`View evidence #${id}`}
        >
          [{id}]
        </button>
      ))}
    </span>
  );
}
