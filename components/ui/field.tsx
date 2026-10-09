import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const controlClass =
  "block h-10 w-full rounded-control border border-tl-line-strong bg-tl-surface px-3 text-body text-tl-text placeholder:text-tl-muted hover:border-tl-muted focus-visible:border-tl-primary focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-tl-primary/25 disabled:bg-tl-raised disabled:opacity-60 aria-invalid:border-tl-danger";

export function Field({
  id,
  label,
  error,
  hint,
  children,
  className,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="text-label font-medium text-tl-text">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-small font-medium text-tl-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-small font-medium text-tl-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function describedBy(id: string, error?: string, hint?: string) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}
