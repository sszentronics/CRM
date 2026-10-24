"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormMessage } from "@/components/features/auth/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signUp } from "../actions";

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUp, null);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state?.message && !state.ok ? <FormMessage tone="error">{state.message}</FormMessage> : null}
      <Input label="Company name" name="company" autoComplete="organization" required autoFocus error={state?.fieldErrors?.company?.[0]} />
      <Input label="Your name" name="fullName" autoComplete="name" required error={state?.fieldErrors?.fullName?.[0]} />
      <Input label="Work email" name="email" type="email" autoComplete="username" required error={state?.fieldErrors?.email?.[0]} />
      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 10 characters."
        error={state?.fieldErrors?.password?.[0]}
      />
      <Button type="submit" block disabled={pending}>
        {pending ? "Creating your workspace" : "Create demo workspace"}
      </Button>
      <p className="text-body text-tl-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-tl-link hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
