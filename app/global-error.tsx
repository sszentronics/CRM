"use client";

import "./globals.css";

/** The last resort, when even the page frame fails. It carries its own html and body, in the same white and purple. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-tl-bg text-tl-text-2">
        <main className="flex min-h-dvh items-center justify-center px-4">
          <div className="flex w-full max-w-md flex-col gap-3 rounded-card border border-tl-line bg-tl-surface p-8 text-center shadow-card">
            <h1 className="tl-display text-display-m text-tl-text">Something went wrong</h1>
            <p className="text-body text-tl-muted">The app could not load. Your work is saved. Try again, and if it keeps happening, tell your Admin.</p>
            <button
              type="button"
              onClick={reset}
              className="mx-auto mt-2 h-10 rounded-control bg-tl-primary px-4 text-body font-semibold text-white hover:bg-tl-primary-hover"
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
