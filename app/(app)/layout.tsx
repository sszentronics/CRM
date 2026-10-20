import { Suspense } from "react";
import { IdleSignOut } from "@/components/features/shell/idle-sign-out";
import { ShellSkeleton } from "@/components/features/shell/shell-skeleton";
import { SideNav } from "@/components/features/shell/side-nav";
import { TopBar } from "@/components/features/shell/top-bar";
import { needsMfa } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";
import { getSetting } from "@/lib/settings/get-setting";
import { runSweepsIfDue } from "@/lib/sweeps";
import { createClient } from "@/lib/supabase/server";

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
  const supabase = await createClient();
  const sweep = runSweepsIfDue();
  const [idleMinutes, { count: unread }] = await Promise.all([
    needsMfa(profile.role) ? getSetting(supabase, "idle_signout_minutes") : Promise.resolve(null),
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
  return (
    <div className="flex min-h-dvh">
      <SideNav role={profile.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar user={user} />
        <main id="main" className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-8 lg:px-8">
          {children}
        </main>
      </div>
      {idleMinutes ? <IdleSignOut minutes={idleMinutes} /> : null}
    </div>
  );
}
