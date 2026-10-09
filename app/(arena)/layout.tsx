import { Suspense } from "react";

// The Arena is one shared page that needs the signed-in user before it can show anything, so it streams
// in on the server instead of being prefetched as a static shell. Validation feedback for it is switched off.
export const instant = false;

/** The Arena has no sidebar: it is a shared page that also runs full screen on the office TV. */
export default function ArenaLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="tl-arena text-white">
      <Suspense fallback={<div aria-busy className="min-h-dvh" />}>{children}</Suspense>
    </div>
  );
}
