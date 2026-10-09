import { CircleAlert, CircleCheck, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A message above or below a form. Errors are announced to screen readers. */
export function FormMessage({ tone, children }: { tone: "error" | "success" | "info"; children: ReactNode }) {
  const Icon = tone === "error" ? CircleAlert : tone === "success" ? CircleCheck : Info;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-control border px-3 py-2.5 text-body",
        tone === "error" && "border-tl-danger/30 bg-tl-danger/5 text-tl-danger",
        tone === "success" && "border-tl-line bg-tl-raised text-tl-text",
        tone === "info" && "border-tl-line bg-tl-raised text-tl-text-2",
      )}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
