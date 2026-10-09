import type { Metadata } from "next";
import { NoAccess } from "@/components/features/shell/no-access";
import { UsersScreen, type PersonRow, type TeamRow } from "@/components/features/users/users-screen";
import { requireAccess } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Users and teams" };

export default async function UsersPage() {
  const ctx = await requireAccess("/users");
  if (!ctx) return <NoAccess />;

  const supabase = await createClient();
  const [{ data: people }, { data: teams }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, phone, role, team_id, photo_url, is_active, created_at")
      .order("full_name"),
    supabase.from("teams").select("id, name, color, team_lead_id, is_active, created_at").order("name"),
  ]);

  return (
    <UsersScreen
      people={(people ?? []) as PersonRow[]}
      teams={(teams ?? []) as TeamRow[]}
      currentUserId={ctx.userId}
      currentRole={ctx.profile.role}
    />
  );
}
