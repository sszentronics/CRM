"use server";

import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth/access";
import { ROLE_HOME, needsMfa, type Role } from "@/lib/auth/roles";
import { emailSchema, newPasswordSchema, signInSchema, totpCodeSchema } from "@/lib/auth/schemas";
import { logAudit } from "@/lib/audit";
import { fieldErrors, formObject, type ActionState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const DISABLED = "Account disabled, contact your Admin.";

function homeFor(role: Role, next?: string | null) {
  return safeNext(role, next) ?? ROLE_HOME[role];
}

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse(formObject(formData));
  if (!parsed.success) return fieldErrors(parsed.error);
  const { email, password, next } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (error?.code === "user_banned") return { ok: false, message: DISABLED };
    return { ok: false, message: "That email and password do not match. Try again or reset your password." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", data.user.id)
    .maybeSingle<{ role: Role; is_active: boolean }>();
  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    return { ok: false, message: DISABLED };
  }

  if (needsMfa(profile.role)) {
    redirect(next ? `/login/mfa?next=${encodeURIComponent(next)}` : "/login/mfa");
  }
  redirect(homeFor(profile.role, next));
}

/** Always answers the same way so it never reveals which emails have accounts. */
export async function sendPasswordReset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = emailSchema.safeParse(formObject(formData));
  if (!parsed.success) return fieldErrors(parsed.error);
  const supabase = await createClient();
  // The email template links to /auth/confirm, which signs the user in and opens /reset-password.
  await supabase.auth.resetPasswordForEmail(parsed.data.email);
  return { ok: true, message: "If that email belongs to a staff account, a reset link is on its way." };
}

export async function setNewPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = newPasswordSchema.safeParse(formObject(formData));
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Your link has expired. Ask for a new one." };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return {
      ok: false,
      message:
        error.code === "same_password"
          ? "Choose a password you have not used before."
          : "That password was not accepted. Use at least 10 characters and try again.",
    };
  }
  await logAudit({ actorId: user.id, action: "auth.password_set", entity: "profile", entityId: user.id });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle<{ role: Role }>();
  if (!profile) redirect("/auth/signout?reason=disabled");
  redirect(needsMfa(profile.role) ? "/login/mfa" : ROLE_HOME[profile.role]);
}

export type EnrollResult = { ok: true; factorId: string; qrCode: string; secret: string } | { ok: false; message: string };

/** First TOTP set-up for Admin and Superadmin: returns the QR code to scan. */
export async function startTotpEnrollment(): Promise<EnrollResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Sign in again to set up your code." };

  const { data: factors } = await supabase.auth.mfa.listFactors();
  // Clear any half-finished set-up so only one pending factor exists.
  for (const f of factors?.all ?? []) {
    if (f.factor_type === "totp" && f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  if ((factors?.totp ?? []).length > 0) return { ok: false, message: "Your authenticator is already set up." };

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Trading Labs ${new Date().toISOString().slice(0, 10)}`,
    issuer: "Trading Labs CRM",
  });
  if (error || !data) return { ok: false, message: "Could not start set-up. Try again." };
  return { ok: true, factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export async function verifyTotp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = totpCodeSchema.safeParse(formObject(formData));
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: before } = await supabase.auth.mfa.listFactors();
  const firstTime = !(before?.totp ?? []).some((f) => f.id === parsed.data.factorId);

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: parsed.data.factorId,
    code: parsed.data.code,
  });
  if (error) {
    return { ok: false, message: "That code did not work. Check the time on your phone and enter the newest code." };
  }
  if (firstTime) {
    await logAudit({ actorId: user.id, action: "auth.totp_enrolled", entity: "profile", entityId: user.id });
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle<{ role: Role }>();
  if (!profile) redirect("/auth/signout?reason=disabled");
  redirect(homeFor(profile.role, (formData.get("next") as string | null) ?? null));
}
