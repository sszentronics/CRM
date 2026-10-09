import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** One line saying what belongs here, one line saying what to do, one button. */
export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-card border border-dashed border-tl-line-strong bg-tl-surface px-6 py-12 text-center",
        className,
      )}
    >
      <p className="text-title font-semibold text-tl-text">{title}</p>
      <p className="max-w-[60ch] text-body text-tl-muted">{body}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
