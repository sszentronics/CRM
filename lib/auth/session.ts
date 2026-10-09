import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { canAccess } from "./access";
import { needsMfa, type Role } from "./roles";

export type Profile = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: Role;
  team_id: string | null;
  photo_url: string | null;
  is_active: boolean;
};

export type SessionContext = {
  userId: string;
  profile: Profile | null;
  /** "aal2" once the TOTP step is done. */
  aal: "aal1" | "aal2" | null;
};

/** The signed-in user and their profile, read once per request. Null when signed out. */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: aal }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, phone, role, team_id, photo_url, is_active")
      .eq("id", user.id)
      .maybeSingle<Profile>(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);

  return { userId: user.id, profile: profile ?? null, aal: (aal?.currentLevel as "aal1" | "aal2" | null) ?? null };
});

/**
 * For every authenticated screen: signed in, active, and past the TOTP step
 * when the role needs it. Redirects otherwise.
 */
export async function requireSession(): Promise<SessionContext & { profile: Profile }> {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!ctx.profile || !ctx.profile.is_active) redirect("/auth/signout?reason=disabled");
  if (needsMfa(ctx.profile.role) && ctx.aal !== "aal2") redirect("/login/mfa");
  return ctx as SessionContext & { profile: Profile };
}

/** requireSession, plus the route check. Returns null when the role may not open `path`. */
export async function requireAccess(path: string) {
  const ctx = await requireSession();
  return canAccess(ctx.profile.role, path) ? ctx : null;
}
