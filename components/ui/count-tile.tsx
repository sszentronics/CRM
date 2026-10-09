import Link from "next/link";
import { cn } from "@/lib/utils";

const toneClass = {
  default: "border-tl-line border-l-tl-primary",
  wait: "border-tl-line border-l-tl-wait",
  danger: "border-tl-line border-l-tl-danger",
} as const;

/** Big number over a label. The whole tile opens the list behind the number. */
export function CountTile({
  count,
  label,
  href,
  tone = "default",
  note,
  className,
}: {
  count: number;
  label: string;
  href: string;
  tone?: keyof typeof toneClass;
  /** Extra word that carries the meaning of the tone, e.g. "Overdue". Colour is never the only signal. */
  note?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-28 flex-col justify-between gap-3 rounded-card border border-l-4 bg-tl-surface p-5 shadow-card transition-colors hover:border-tl-line-strong",
        toneClass[tone],
        className,
      )}
    >
      <span className="tl-display tl-amount text-display-l text-tl-text">{count}</span>
      <span className="flex flex-col text-label font-medium text-tl-muted">
        <span>{label}</span>
        {note ? (
          <span className={cn("font-semibold", tone === "danger" ? "text-tl-danger" : tone === "wait" ? "text-tl-wait" : "text-tl-text-2")}>
            {note}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
