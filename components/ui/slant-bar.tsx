import { Plus } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/** Where the 100 percent tick sits on the track, leaving room for the "+" marker past target. */
const TICK_AT = 0.88;

/**
 * Progress toward a target, cut with the logo's slant. Fill width is the share
 * of target, capped at 100 percent; past target a "+" marker appears.
 */
export function SlantBar({
  value,
  target,
  color = "var(--tl-primary)",
  height = 24,
  showTick = true,
  label,
  className,
}: {
  value: number;
  target: number;
  /** A team colour, e.g. teamColorVar("cyan"). */
  color?: string;
  height?: number;
  showTick?: boolean;
  label: string;
  className?: string;
}) {
  const share = target > 0 ? value / target : 0;
  const pct = Math.round(share * 100);
  const scale = showTick ? TICK_AT : 1;
  const fill = Math.min(share, 1) * scale;
  const over = share > 1;
  const vars = { "--bar-h": `${height}px` } as CSSProperties;

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(pct, 100)}
      aria-valuetext={`${pct}% of target`}
      className={cn("relative w-full", className)}
      style={{ height, ...vars }}
    >
      <div className="tl-slant absolute inset-0 bg-tl-raised" />
      {fill > 0 ? (
        <div
          data-fill
          className="tl-slant absolute inset-y-0 left-0"
          style={{ width: `max(calc(${fill * 100}%), calc(var(--bar-h) * 1.2))`, backgroundColor: color }}
        />
      ) : null}
      {showTick ? (
        <div
          aria-hidden
          className="absolute -inset-y-1 w-0.5 bg-tl-text-2"
          style={{ left: `calc(${TICK_AT * 100}% - 1px)` }}
        />
      ) : null}
      {over ? (
        <Plus
          aria-hidden
          strokeWidth={3}
          className="absolute top-1/2 -translate-y-1/2 text-tl-text-2"
          style={{ left: `calc(${TICK_AT * 100}% + 6px)`, width: height * 0.7, height: height * 0.7 }}
        />
      ) : null}
    </div>
  );
}
