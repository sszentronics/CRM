"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Present when the column can be sorted. */
  sortValue?: (row: T) => string | number;
  align?: "left" | "right";
  /** Shown as the card title on phone. One column should set this. */
  primary?: boolean;
};

type Sort = { key: string; dir: "asc" | "desc" } | null;

/** Sortable table with a sticky header and row count. On narrow windows each row becomes a card. */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  caption,
  noun = "rows",
  pageSize,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  caption: string;
  noun?: string;
  /** Show this many rows at a time, with Previous and Next. Omit to show all. */
  pageSize?: number;
}) {
  const [sort, setSort] = useState<Sort>(null);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    const out = [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      return va < vb ? -1 : va > vb ? 1 : 0;
    });
    return sort.dir === "asc" ? out : out.reverse();
  }, [rows, columns, sort]);

  function toggle(key: string) {
    setSort((s) => (s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  const pages = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const current = Math.min(page, pages - 1);
  const shown = pageSize ? sorted.slice(current * pageSize, (current + 1) * pageSize) : sorted;

  const primary = columns.find((c) => c.primary) ?? columns[0];
  const rest = columns.filter((c) => c !== primary);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-label font-medium text-tl-muted">
        {sorted.length} {noun}
      </p>

      {/* Desktop and tablet */}
      <div className="hidden overflow-hidden rounded-card border border-tl-line bg-tl-surface md:block">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 z-10 bg-tl-bg">
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                    className={cn(
                      "border-b border-tl-line px-4 py-2.5 text-label font-semibold text-tl-muted",
                      c.align === "right" && "text-right",
                    )}
                  >
                    {c.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggle(c.key)}
                        className={cn(
                          "inline-flex items-center gap-1 hover:text-tl-text",
                          c.align === "right" && "flex-row-reverse",
                        )}
                      >
                        {c.header}
                        {active ? (
                          sort.dir === "asc" ? (
                            <ArrowUp aria-hidden className="size-4" />
                          ) : (
                            <ArrowDown aria-hidden className="size-4" />
                          )
                        ) : (
                          <ArrowUpDown aria-hidden className="size-4 opacity-60" />
                        )}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={rowKey(row)} className="border-t border-tl-line first:border-t-0 hover:bg-tl-bg">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn("px-4 py-3 text-body text-tl-text-2", c.align === "right" && "text-right tl-amount")}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phone */}
      <ul className="flex flex-col gap-2 md:hidden" aria-label={caption}>
        {shown.map((row) => (
          <li key={rowKey(row)} className="rounded-card border border-tl-line bg-tl-surface p-4 shadow-card">
            <div className="mb-2 text-body font-semibold text-tl-text">{primary.cell(row)}</div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {rest.map((c) => (
                <div key={c.key} className="contents">
                  <dt className="text-label font-medium text-tl-muted">{c.header}</dt>
                  <dd className="text-right text-body text-tl-text-2">{c.cell(row)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>

      {pages > 1 ? (
        <nav aria-label={`${caption} pages`} className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setPage(Math.max(0, current - 1))}
            disabled={current === 0}
            className="inline-flex h-8 items-center gap-1 rounded-control border border-tl-line-strong bg-tl-surface px-3 text-label font-semibold text-tl-text disabled:opacity-50"
          >
            <ChevronLeft aria-hidden className="size-4" />
            Previous
          </button>
          <span className="tl-amount text-label text-tl-muted">
            Page {current + 1} of {pages}
          </span>
          <button
            type="button"
            onClick={() => setPage(Math.min(pages - 1, current + 1))}
            disabled={current >= pages - 1}
            className="inline-flex h-8 items-center gap-1 rounded-control border border-tl-line-strong bg-tl-surface px-3 text-label font-semibold text-tl-text disabled:opacity-50"
          >
            Next
            <ChevronRight aria-hidden className="size-4" />
          </button>
        </nav>
      ) : null}
    </div>
  );
}
