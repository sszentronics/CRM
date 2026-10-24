import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { safeNext } from "@/lib/auth/access";
import { ROLE_HOME, needsMfa, type Role } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { EnrollTotp, VerifyTotp } from "./totp-forms";

export const metadata: Metadata = { title: "Two-step sign-in" };

export default function MfaPage({ searchParams }: PageProps<"/login/mfa">) {
  return (
    <Suspense>
      <MfaGate searchParams={searchParams} />
    </Suspense>
  );
}

async function MfaGate({ searchParams }: { searchParams: PageProps<"/login/mfa">["searchParams"] }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active, workspaces!inner (plan)")
    .eq("id", user.id)
    .maybeSingle<{ role: Role; is_active: boolean; workspaces: { plan: "client" | "trial" } }>();
  if (!profile || !profile.is_active) redirect("/auth/signout?reason=disabled");
  if (!needsMfa(profile.role, profile.workspaces.plan)) redirect(ROLE_HOME[profile.role]);

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") redirect(safeNext(profile.role, next) ?? ROLE_HOME[profile.role]);

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = factors?.totp?.[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="tl-display text-display-m text-tl-text">
          {verified ? "Enter your code" : "Set up two-step sign-in"}
        </h1>
        <p className="text-body text-tl-muted">
          {verified
            ? "Open your authenticator app and enter the 6-digit code for QuantraPro."
            : "Admin accounts need a second step. Scan the code with an authenticator app such as Google Authenticator or Microsoft Authenticator, then enter the 6-digit code it shows."}
        </p>
      </div>
      {verified ? <VerifyTotp factorId={verified.id} next={next} /> : <EnrollTotp next={next} />}
      <a href="/auth/signout?reason=signed-out" className="text-label font-semibold text-tl-link hover:underline">
        Use a different account
      </a>
    </div>
  );
}
