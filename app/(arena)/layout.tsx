import { Suspense } from "react";

/** The Arena has no sidebar: it is a shared page that also runs full screen on the office TV. */
export default function ArenaLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="tl-arena text-white">
      <Suspense fallback={<div aria-busy className="min-h-dvh" />}>{children}</Suspense>
    </div>
  );
}
