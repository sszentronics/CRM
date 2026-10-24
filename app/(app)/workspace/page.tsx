import type { Metadata } from "next";
import { NoAccess } from "@/components/features/shell/no-access";
import { WorkspaceScreen } from "@/components/features/workspace/workspace-screen";
import { requireAccess } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace/get";

export const metadata: Metadata = { title: "Workspace" };

export default async function WorkspacePage() {
  if (!(await requireAccess("/workspace"))) return <NoAccess />;
  const workspace = await getWorkspace();
  if (!workspace) return <NoAccess />;
  const supabase = await createClient();
  const { data: requests } = await supabase
    .from("workspace_requests")
    .select("id, created_at, kind, note, status")
    .order("created_at", { ascending: false })
    .limit(10);
  return <WorkspaceScreen workspace={workspace} requests={requests ?? []} />;
}
