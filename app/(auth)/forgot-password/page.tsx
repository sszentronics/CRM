"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormMessage } from "@/components/features/auth/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendPasswordReset } from "../actions";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(sendPasswordReset, null);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="tl-display text-display-m text-tl-text">Reset your password</h1>
        <p className="text-body text-tl-muted">We will email you a link to choose a new one.</p>
      </div>
      {state?.ok ? (
        <FormMessage tone="success">{state.message}</FormMessage>
      ) : (
        <form action={action} className="flex flex-col gap-4" noValidate>
          <Input
            label="Email"
            name="email"
            type="email"
            autoComplete="username"
            autoFocus
            error={state?.fieldErrors?.email?.[0]}
          />
          <Button type="submit" block disabled={pending}>
            {pending ? "Sending" : "Send reset link"}
          </Button>
        </form>
      )}
      <Link href="/login" className="text-label font-semibold text-tl-link hover:underline">
        Back to sign in
      </Link>
    </div>
  );
}
