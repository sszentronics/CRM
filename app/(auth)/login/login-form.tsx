"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { FormMessage } from "@/components/features/auth/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn } from "../actions";

const REASONS: Record<string, string> = {
  disabled: "Account disabled, contact your Admin.",
  idle: "You were signed out after a period without activity. Sign in again to continue.",
  "signed-out": "You are signed out.",
  link: "That link has expired or was already used. Ask for a new one.",
};

export function LoginForm() {
  const params = useSearchParams();
  const [state, action, pending] = useActionState(signIn, null);
  const reason = params.get("reason");
  const notice = reason ? REASONS[reason] : undefined;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state?.message && !state.ok ? (
        <FormMessage tone="error">{state.message}</FormMessage>
      ) : notice ? (
        <FormMessage tone={reason === "disabled" ? "error" : "info"}>{notice}</FormMessage>
      ) : null}
      <input type="hidden" name="next" value={params.get("next") ?? ""} />
      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="username"
        required
        autoFocus
        error={state?.fieldErrors?.email?.[0]}
      />
      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state?.fieldErrors?.password?.[0]}
      />
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-label font-semibold text-tl-link hover:underline">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" block disabled={pending}>
        {pending ? "Signing in" : "Sign in"}
      </Button>
    </form>
  );
}
