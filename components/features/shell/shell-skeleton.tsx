/** Shown for the moment the session is read. Blocks in final sizes, no spinner. */
export function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh" aria-busy aria-label="Loading">
      <div className="hidden w-[var(--tl-sidebar-w)] shrink-0 bg-tl-brand lg:block" />
      <div className="flex flex-1 flex-col">
        <div className="h-[var(--tl-topbar-h)] border-b border-tl-line bg-tl-surface" />
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 py-8 lg:px-8">
          <div className="h-8 w-56 rounded-control bg-tl-raised" />
          <div className="h-48 rounded-card bg-tl-surface shadow-card" />
        </div>
      </div>
    </div>
  );
}
