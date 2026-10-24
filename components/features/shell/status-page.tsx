import Image from "next/image";
import type { ReactNode } from "react";

/**
 * A full-page message in the QuantraPro theme: error, not found and offline.
 * The logo sits on the brand rail, as the design rules require.
 */
export function StatusPage({ title, message, actions }: { title: string; message: string; actions?: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-tl-bg px-4 py-12">
      <div className="flex w-full max-w-md flex-col overflow-hidden rounded-card border border-tl-line bg-tl-surface text-center shadow-card">
        <div className="flex items-center justify-center bg-tl-brand py-8">
          <Image src="/brand/quantrapro-logo.svg" alt="QuantraPro" width={60} height={60} priority />
        </div>
        <div className="flex flex-col items-center gap-3 px-6 py-8">
          <h1 className="tl-display text-display-m text-tl-text">{title}</h1>
          <p className="text-body text-tl-muted">{message}</p>
          {actions ? <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{actions}</div> : null}
        </div>
      </div>
    </main>
  );
}
