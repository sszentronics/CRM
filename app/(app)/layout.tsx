import { Suspense } from "react";
import { DemoEnded } from "@/components/features/shell/demo-ended";
import { IdleSignOut } from "@/components/features/shell/idle-sign-out";
import { ShellSkeleton } from "@/components/features/shell/shell-skeleton";
import { SideNav } from "@/components/features/shell/side-nav";
import { TopBar } from "@/components/features/shell/top-bar";
import { WorkspaceBanner } from "@/components/features/shell/workspace-banner";
import { needsMfa } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";
import { getSetting } from "@/lib/settings/get-setting";
import { runSweepsIfDue } from "@/lib/sweeps";
import { createClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace/get";
import { isPlatformAdmin } from "@/lib/workspace/platform";
import { themeCss } from "@/lib/workspace/theme";
import { trialDaysLeft } from "@/lib/workspace/trial";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <AuthedShell>{children}</AuthedShell>
    </Suspense>
  );
}

/** Reads the session, so it streams in behind the boundary above. */
async function AuthedShell({ children }: { children: React.ReactNode }) {
  const { profile } = await requireSession();
  const workspace = await getWorkspace();
  if (!workspace) throw new Error("This account has no workspace.");
  const supabase = await createClient();
  const sweep = runSweepsIfDue();
  const [idleMinutes, { count: unread }] = await Promise.all([
    needsMfa(profile.role, workspace.plan) ? getSetting(supabase, "idle_signout_minutes") : Promise.resolve(null),
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);
  await sweep;
  const user = {
    id: profile.id,
    unread: unread ?? 0,
    fullName: profile.full_name,
    role: profile.role,
    photoUrl: profile.photo_url,
  };
  const daysLeft = trialDaysLeft(workspace.plan, workspace.trialEndsAt);
  const ended = daysLeft === 0;
  const brand = { name: workspace.name, logoPath: workspace.logoPath };
  // A client's own colours replace the QuantraPro green. Only validated hex values reach this string.
  const css = workspace.plan === "client" ? themeCss(workspace.theme) : "";
  return (
    <div className="flex min-h-dvh">
      {css ? <style>{css}</style> : null}
      <SideNav role={profile.role} brand={brand} platform={isPlatformAdmin(profile.email)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar user={user} brand={brand} platform={isPlatformAdmin(profile.email)} />
        <main id="main" className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-8 lg:px-8">
          {daysLeft !== null && !ended ? (
            <WorkspaceBanner daysLeft={daysLeft} chosen={workspace.product === "crm"} canAct={profile.role === "superadmin"} />
          ) : null}
          {ended ? <DemoEnded canRequest={profile.role === "superadmin"} /> : children}
        </main>
      </div>
      {idleMinutes ? <IdleSignOut minutes={idleMinutes} /> : null}
    </div>
  );
}
