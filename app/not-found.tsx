import Link from "next/link";
import { StatusPage } from "@/components/features/shell/status-page";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <StatusPage
      title="Page not found"
      message="That page does not exist, or the link is out of date."
      actions={
        <Link href="/" className={buttonVariants({ variant: "primary" })}>
          Go to my home screen
        </Link>
      }
    />
  );
}
