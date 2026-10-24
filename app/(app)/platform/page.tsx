import type { Metadata } from "next";
import { NoAccess } from "@/components/features/shell/no-access";
import { PlatformScreen } from "@/components/features/workspace/platform-screen";
import { requireSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/workspace/platform";

export const metadata: Metadata = { title: "All workspaces" };

export default async function PlatformPage() {
  const { profile } = await requireSession();
  if (!isPlatformAdmin(profile.email)) return <NoAccess />;
  // Service role on purpose: this screen spans every workspace. Access was checked above.
  const admin = createAdminClient();
  const [{ data: workspaces }, { data: requests }, { data: owners }] = await Promise.all([
    admin.from("workspaces").select("id, name, plan, trial_ends_at, product, created_at").order("created_at", { ascending: false }),
    admin
      .from("workspace_requests")
      .select("id, created_at, workspace_id, kind, note, status, requested_by")
      .order("created_at", { ascending: false })
      .limit(50),
    admin.from("profiles").select("workspace_id, email").eq("role", "superadmin"),
  ]);
  const ownerOf = new Map<string, string>();
  for (const o of owners ?? []) if (!ownerOf.has(o.workspace_id as string)) ownerOf.set(o.workspace_id as string, o.email as string);
  return (
    <PlatformScreen
      workspaces={(workspaces ?? []).map((w) => ({ ...w, owner: ownerOf.get(w.id as string) ?? null })) as never}
      requests={(requests ?? []) as never}
    />
  );
}
