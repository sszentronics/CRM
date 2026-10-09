import { ArrowDown, ArrowUp, Crown } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * Slanted block with the rank number. Rank 1 is white on primary with a crown.
 * `moved` is places moved since yesterday: positive is up, negative is down.
 */
export function RankBadge({
  rank,
  moved,
  size = 40,
  className,
}: {
  rank: number;
  moved?: number;
  size?: number;
  className?: string;
}) {
  const first = rank === 1;
  const vars = { "--bar-h": `${size}px`, height: size, minWidth: size * 1.6 } as CSSProperties;
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        className={cn(
          "tl-slant tl-display tl-amount inline-flex items-center justify-center gap-1 px-[calc(var(--bar-h)*0.6)]",
          first ? "bg-tl-primary text-white" : "bg-tl-raised text-tl-text",
        )}
        style={{ ...vars, fontSize: size * 0.5 }}
      >
        {first ? <Crown aria-hidden className="size-[0.8em]" strokeWidth={2.5} /> : null}
        <span className="sr-only">Rank </span>
        {rank}
      </span>
      {moved ? (
        <span
          className={cn(
            "inline-flex items-center text-small font-medium",
            moved > 0 ? "text-tl-primary" : "text-tl-muted",
          )}
        >
          {moved > 0 ? <ArrowUp aria-hidden className="size-3.5" /> : <ArrowDown aria-hidden className="size-3.5" />}
          {Math.abs(moved)}
          <span className="sr-only">
            {` place${Math.abs(moved) === 1 ? "" : "s"} ${moved > 0 ? "up" : "down"} since yesterday`}
          </span>
        </span>
      ) : null}
    </span>
  );
}
