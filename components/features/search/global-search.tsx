"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { searchLeads, type SearchResult } from "@/app/(app)/search/actions";
import { StageChip } from "@/components/ui/stage-chip";
import { formatPhone } from "@/lib/format/phone";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 250;

/** Top-bar search by name or phone. Live results from 3 characters; Enter opens the full results page. */
export function GlobalSearch() {
  const router = useRouter();
  const listId = useId();
  const [q, setQ] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const seq = useRef(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) return;
    const mine = ++seq.current;
    const t = window.setTimeout(async () => {
      const r = await searchLeads(term);
      if (mine === seq.current) {
        setResult(r);
        setActive(-1);
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const hits = q.trim().length >= 3 ? (result?.hits ?? []) : [];
  const showPanel = open && q.trim().length >= 3 && result !== null;

  function go(id: string) {
    setOpen(false);
    router.push(`/lead/${id}`);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && hits[active]) go(hits[active].id);
      else if (q.trim().length >= 3) {
        setOpen(false);
        router.push(`/search?q=${encodeURIComponent(q.trim())}`);
      }
    }
  }

  return (
    <div ref={box} role="search" className="relative w-full max-w-md">
      <label htmlFor="global-search" className="sr-only">
        Search leads by name, phone or CNIC
      </label>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-tl-muted" />
      <input
        id="global-search"
        type="search"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder="Search by name, phone or CNIC"
        className="h-10 w-full rounded-control border border-tl-line bg-tl-bg pr-3 pl-9 text-body text-tl-text placeholder:text-tl-muted hover:border-tl-line-strong focus-visible:border-tl-primary focus-visible:bg-tl-surface"
      />
      {showPanel ? (
        <div className="absolute top-12 right-0 left-0 z-40 overflow-hidden rounded-card border border-tl-line bg-tl-surface shadow-pop">
          {hits.length > 0 ? (
            <ul id={listId} role="listbox" aria-label="Matching leads">
              {hits.map((h, i) => (
                <li
                  key={h.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    go(h.id);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-3 border-b border-tl-line px-4 py-2.5 last:border-b-0",
                    i === active && "bg-tl-raised",
                  )}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-body font-semibold text-tl-text">{h.full_name}</span>
                    <span className="tl-amount text-small text-tl-muted">{formatPhone(h.phone)}</span>
                  </span>
                  <StageChip stage={h.stage} />
                </li>
              ))}
            </ul>
          ) : (
            <p id={listId} role="status" className="px-4 py-3 text-body text-tl-text-2">
              {result?.elsewhere ? "Already in the system." : "No leads match."}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
