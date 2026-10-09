import { Lock } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

/** Shown when a role opens a screen it may not use. The data behind it is also closed by RLS. */
export function NoAccess({ message = "Your role cannot open this page." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-tl-line bg-tl-surface px-6 py-16 text-center shadow-card">
      <span className="flex size-12 items-center justify-center rounded-full bg-tl-raised text-tl-primary">
        <Lock aria-hidden className="size-5" />
      </span>
      <h1 className="tl-display text-display-m text-tl-text">No access</h1>
      <p className="max-w-[60ch] text-body text-tl-muted">{message}</p>
      <Link href="/" className={buttonVariants({ variant: "secondary", className: "mt-2" })}>
        Go to my home screen
      </Link>
    </div>
  );
}
