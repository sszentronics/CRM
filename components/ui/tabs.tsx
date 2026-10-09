"use client";

import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export type TabItem<T extends string> = { value: T; label: string; count?: number };

/** Underlined tabs. Arrow keys move between tabs, as screen-reader users expect. */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
  idPrefix,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  idPrefix: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKey(e: KeyboardEvent, i: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (i + (e.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;
    onChange(items[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div role="tablist" aria-label={label} className="flex gap-6 border-b border-tl-line">
      {items.map((item, i) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            id={`${idPrefix}-tab-${item.value}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${item.value}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "-mb-px flex h-10 items-center gap-2 border-b-2 text-body font-semibold transition-colors",
              selected ? "border-tl-primary text-tl-text" : "border-transparent text-tl-muted hover:text-tl-text",
            )}
          >
            {item.label}
            {item.count !== undefined ? (
              <span
                className={cn(
                  "tl-amount rounded-full px-2 text-small",
                  selected ? "bg-tl-primary-soft text-tl-primary" : "bg-tl-raised text-tl-muted",
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
