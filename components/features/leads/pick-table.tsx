"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PickColumn<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  className?: string;
};

/**
 * A table of leads with a tick box per row and one in the header for the visible rows.
 * Selection lives with the parent, so it can hold leads beyond the visible page.
 */
export function PickTable<T extends { id: string }>({
  rows,
  columns,
  selected,
  onChange,
  caption,
  rowLabel,
  empty,
}: {
  rows: T[];
  columns: PickColumn<T>[];
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  caption: string;
  /** Accessible name for a row's tick box, e.g. the lead's name. */
  rowLabel: (row: T) => string;
  empty: ReactNode;
}) {
  const visibleIds = rows.map((r) => r.id);
  const allVisible = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someVisible = visibleIds.some((id) => selected.has(id));

  function toggleAll() {
    const next = new Set(selected);
    for (const id of visibleIds) {
      if (allVisible) next.delete(id);
      else next.add(id);
    }
    onChange(next);
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  if (rows.length === 0) return <>{empty}</>;

  return (
    <div className="overflow-x-auto rounded-card border border-tl-line bg-tl-surface">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 z-10 bg-tl-bg">
          <tr>
            <th scope="col" className="w-10 border-b border-tl-line px-4 py-2.5">
              <input
                type="checkbox"
                aria-label={allVisible ? "Untick all shown" : "Tick all shown"}
                checked={allVisible}
                ref={(el) => {
                  if (el) el.indeterminate = !allVisible && someVisible;
                }}
                onChange={toggleAll}
                className="size-4 accent-[var(--tl-primary)]"
              />
            </th>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  "border-b border-tl-line px-3 py-2.5 text-label font-semibold text-tl-muted",
                  c.align === "right" && "text-right",
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const on = selected.has(r.id);
            return (
              <tr
                key={r.id}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("a, button, input")) return;
                  toggle(r.id);
                }}
                className={cn("cursor-pointer border-t border-tl-line first:border-t-0", on ? "bg-tl-primary-soft/60" : "hover:bg-tl-bg")}
              >
                <td className="px-4 py-2.5">
                  <input
                    type="checkbox"
                    aria-label={`Tick ${rowLabel(r)}`}
                    checked={on}
                    onChange={() => toggle(r.id)}
                    className="size-4 accent-[var(--tl-primary)]"
                  />
                </td>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn("px-3 py-2.5 text-body text-tl-text-2", c.align === "right" && "text-right", c.className)}
                  >
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
