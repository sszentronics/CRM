import type { Metadata } from "next";
import { SignUpForm } from "./signup-form";

export const metadata: Metadata = { title: "Start your 14-day demo" };

export default function SignUpPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="tl-display text-display-m text-tl-text">Start your 14-day demo</h1>
        <p className="text-body text-tl-muted">
          No card needed. You get your own workspace with the default CRM, and can ask us for a custom site.
        </p>
      </div>
      <SignUpForm />
    </div>
  );
}
