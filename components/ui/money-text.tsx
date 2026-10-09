"use client";

import { useEffect, useRef, useState } from "react";
import { formatPKR, formatPKRCompact } from "@/lib/format/money";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

const COUNT_MS = 600;

/**
 * An amount in Archivo with tabular figures. Green only when the money is verified.
 * With `countUp`, a change in `amount` counts from the old value over 600 ms.
 */
export function MoneyText({
  amount,
  verified = false,
  compact = false,
  countUp = false,
  className,
}: {
  amount: number;
  verified?: boolean;
  compact?: boolean;
  countUp?: boolean;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(amount);
  const from = useRef(amount);

  useEffect(() => {
    const start = from.current;
    from.current = amount;
    if (!countUp || reduced || start === amount) {
      setShown(amount);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / COUNT_MS);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(start + (amount - start) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [amount, countUp, reduced]);

  const text = compact ? formatPKRCompact(shown) : formatPKR(shown);
  return (
    <span
      className={cn("tl-display tl-amount whitespace-nowrap", verified ? "text-tl-win" : "text-tl-text", className)}
      aria-label={compact ? formatPKR(amount) : undefined}
    >
      {text}
    </span>
  );
}
