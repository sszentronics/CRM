import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="tl-display text-display-m text-tl-text">Sign in</h1>
        <p className="text-body text-tl-muted">Use your work email. Your company colours load once you are in.</p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
      <p className="text-body text-tl-muted">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-tl-link hover:underline">
          Start a 14-day demo
        </Link>
      </p>
    </div>
  );
}
