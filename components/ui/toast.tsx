"use client";

import { X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "info";
type ToastItem = { id: number; kind: ToastKind; message: ReactNode };

const DURATION_MS = 4000;
const MAX_VISIBLE = 2;

const ToastContext = createContext<((message: ReactNode, kind?: ToastKind) => void) | null>(null);

export function useToast() {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast must be used inside <ToastProvider>");
  return show;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), []);

  const show = useCallback(
    (message: ReactNode, kind: ToastKind = "success") => {
      const id = nextId.current++;
      // Never stack more than two: the newest pushes the oldest out.
      setItems((all) => [...all, { id, kind, message }].slice(-MAX_VISIBLE));
      window.setTimeout(() => dismiss(id), DURATION_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed top-4 right-4 z-50 flex w-[380px] max-w-[calc(100vw-32px)] flex-col gap-2"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-control border border-tl-line border-l-4 bg-tl-surface py-3 pr-2 pl-4 text-body text-tl-text shadow-pop motion-safe:animate-[tl-toast-in_200ms_ease-out]",
              t.kind === "success" && "border-l-tl-win",
              t.kind === "error" && "border-l-tl-danger",
              t.kind === "info" && "border-l-tl-primary",
            )}
          >
            <div className="flex-1 pt-1.5">{t.message}</div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-control text-tl-muted hover:bg-tl-raised hover:text-tl-text"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
