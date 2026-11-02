"use client";

import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState, useState, type KeyboardEvent } from "react";
import { FormMessage } from "@/components/features/auth/form-message";
import { Button } from "@/components/ui/button";
import { Field, controlClass, describedBy } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signIn } from "../actions";

const REASONS: Record<string, string> = {
  disabled: "Account disabled, contact your Admin.",
  idle: "You were signed out after a period without activity. Sign in again to continue.",
  "signed-out": "You are signed out.",
  link: "That link has expired or was already used. Ask for a new one.",
};

const EMAIL_KEY = "tl-last-email";

function savedEmail() {
  try {
    return localStorage.getItem(EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Email and password, with a show button, a Caps Lock warning, and the last email remembered on this device. */
export function LoginForm() {
  const params = useSearchParams();
  const [state, action, pending] = useActionState(signIn, null);
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const [email] = useState(savedEmail);
  const reason = params.get("reason");
  const notice = reason ? REASONS[reason] : undefined;
  const passwordError = state?.fieldErrors?.password?.[0];

  function remember(form: HTMLFormElement) {
    const value = new FormData(form).get("email");
    try {
      if (typeof value === "string" && value.includes("@")) localStorage.setItem(EMAIL_KEY, value.trim().toLowerCase());
    } catch {
      // Private windows can refuse storage; sign-in still works.
    }
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState("CapsLock"));

  return (
    <form action={action} onSubmit={(e) => remember(e.currentTarget)} className="flex flex-col gap-4" noValidate>
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
        defaultValue={email}
        required
        autoFocus={!email}
        placeholder="you@company.com"
        error={state?.fieldErrors?.email?.[0]}
      />
      <Field
        id="login-password"
        label="Password"
        error={passwordError}
        hint={caps ? "Caps Lock is on." : undefined}
      >
        <div className="relative">
          <input
            id="login-password"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            required
            autoFocus={!!email}
            onKeyUp={onKey}
            onKeyDown={onKey}
            aria-invalid={passwordError ? true : undefined}
            aria-describedby={describedBy("login-password", passwordError, caps ? "on" : undefined)}
            className={`${controlClass} pr-11`}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
            className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-control text-tl-muted hover:text-tl-text"
          >
            {show ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
          </button>
        </div>
      </Field>
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
