"use client";

import Link from "next/link";
import { StatusPage } from "@/components/features/shell/status-page";
import { Button, buttonVariants } from "@/components/ui/button";

/** Shown when a screen fails to load. The message never shows technical detail. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <StatusPage
      title="Something went wrong"
      message="This screen could not load. Your work is saved. Try again, and if it keeps happening, tell your Admin."
      actions={
        <>
          <Button onClick={reset}>Try again</Button>
          <Link href="/" className={buttonVariants({ variant: "secondary" })}>
            Go to my home screen
          </Link>
        </>
      }
    />
  );
}
