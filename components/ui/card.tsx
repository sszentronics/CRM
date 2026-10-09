import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** White surface block. Never nest a Card inside a Card. */
export function Card({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn("rounded-card border border-tl-line bg-tl-surface p-6 shadow-card", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<"h2">) {
  return <h2 className={cn("text-title font-semibold text-tl-text", className)} {...props} />;
}

/** Title on the left, optional actions on the right, optional one-line description below. */
export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex items-start justify-between gap-4", className)}>
      <div className="flex flex-col gap-0.5">
        <CardTitle>{title}</CardTitle>
        {description ? <p className="text-body text-tl-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
