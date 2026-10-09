import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** On/off switch. Always pair it with a visible or accessible label naming what it turns on. */
export function Switch({
  checked,
  className,
  ...props
}: Omit<ComponentProps<"button">, "role"> & { checked: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors disabled:opacity-50",
        checked ? "bg-tl-primary" : "bg-tl-line-strong",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block size-5 rounded-full bg-white shadow-card transition-transform",
          checked ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  );
}
