import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Shown on every screen of a demo workspace: days left, and the way to a custom site or the default CRM. */
export function WorkspaceBanner({ daysLeft, chosen, canAct }: { daysLeft: number; chosen: boolean; canAct: boolean }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-card border border-tl-line bg-tl-primary-soft px-5 py-3">
      <div className="flex flex-col">
        <p className="text-body font-semibold text-tl-text">
          {daysLeft === 1 ? "1 day left in your demo" : `${daysLeft} days left in your demo`}
        </p>
        <p className="text-small text-tl-text-2">
          {chosen
            ? "Ask for a custom site, or talk to us about becoming a client to unlock your own colours."
            : "Start the default CRM, or ask us for a custom site."}
        </p>
      </div>
      {canAct ? (
        <Link href="/workspace" className={cn(buttonVariants({ size: "sm" }))}>
          {chosen ? "Request a custom site" : "Choose your setup"}
        </Link>
      ) : null}
    </div>
  );
}
