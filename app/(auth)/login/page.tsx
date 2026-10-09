import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="tl-display text-display-m text-tl-text">Sign in</h1>
        <p className="text-body text-tl-muted">Use the work email your Superadmin set up for you.</p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
