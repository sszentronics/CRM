"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

/**
 * A drawer that slides in from the right, for forms and detail views on laptop screens.
 * When `dirty` is true, closing asks first so typed input is not lost.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  dirty = false,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  dirty?: boolean;
  children: ReactNode;
  /** Actions pinned to the bottom of the drawer, primary action last. */
  footer?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [confirming, setConfirming] = useState(false);
  const titleId = useId();
  const discardId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function requestClose() {
    if (dirty) setConfirming(true);
    else onClose();
  }

  function discard() {
    setConfirming(false);
    onClose();
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
      className={cn(
        "fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-full max-w-[480px] border-0 bg-transparent p-0 text-tl-text-2",
        "backdrop:bg-[rgb(27_16_48/0.35)] open:motion-safe:animate-[tl-drawer-in_200ms_ease-out]",
      )}
    >
      <div className={cn("flex h-full flex-col border-l border-tl-line bg-tl-surface shadow-pop", className)}>
        <div className="flex items-start justify-between gap-4 border-b border-tl-line px-6 py-4">
          <div className="flex flex-col gap-0.5">
            <h2 id={titleId} className="text-title font-semibold text-tl-text">
              {title}
            </h2>
            {description ? <p className="text-body text-tl-muted">{description}</p> : null}
          </div>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={requestClose} className="-mr-2">
            <X aria-hidden className="size-5" />
          </Button>
        </div>
        {confirming ? (
          <div role="alertdialog" aria-labelledby={discardId} className="flex flex-col gap-4 px-6 py-5">
            <p id={discardId} className="text-body text-tl-text">
              You have unsaved changes. Discard them?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Keep editing
              </Button>
              <Button variant="danger" onClick={discard}>
                Discard changes
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer ? (
              <div className="flex justify-end gap-2 border-t border-tl-line bg-tl-bg px-6 py-4">{footer}</div>
            ) : null}
          </>
        )}
      </div>
    </dialog>
  );
}
