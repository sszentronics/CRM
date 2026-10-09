"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/features/auth/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setNewPassword } from "../actions";

/** Reached from an invite or reset email, after /auth/confirm has signed the user in. */
export default function ResetPasswordPage() {
  const [state, action, pending] = useActionState(setNewPassword, null);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="tl-display text-display-m text-tl-text">Choose your password</h1>
        <p className="text-body text-tl-muted">Use at least 10 characters. A short sentence is easy to remember.</p>
      </div>
      <form action={action} className="flex flex-col gap-4" noValidate>
        {state?.message && !state.ok && !state.fieldErrors ? <FormMessage tone="error">{state.message}</FormMessage> : null}
        <Input
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          autoFocus
          error={state?.fieldErrors?.password?.[0]}
        />
        <Input
          label="Type it again"
          name="confirm"
          type="password"
          autoComplete="new-password"
          error={state?.fieldErrors?.confirm?.[0]}
        />
        <Button type="submit" block disabled={pending}>
          {pending ? "Saving" : "Save password"}
        </Button>
      </form>
    </div>
  );
}
