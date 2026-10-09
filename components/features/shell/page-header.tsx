import type { ReactNode } from "react";

/** Screen title with an optional description and actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="tl-display text-display-m text-tl-text">{title}</h1>
        {description ? <p className="max-w-[70ch] text-body text-tl-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}
