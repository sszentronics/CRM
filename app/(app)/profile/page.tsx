import type { Metadata } from "next";
import { ProfileScreen } from "@/components/features/profile/profile-screen";
import { NoAccess } from "@/components/features/shell/no-access";
import { requireAccess } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { TeamColor } from "@/lib/teams";

export const metadata: Metadata = { title: "My profile" };

export default async function ProfilePage() {
  const ctx = await requireAccess("/profile");
  if (!ctx) return <NoAccess />;
  const { profile } = ctx;

  let team: { name: string; color: TeamColor } | null = null;
  if (profile.team_id) {
    const supabase = await createClient();
    const { data } = await supabase.from("teams").select("name, color").eq("id", profile.team_id).maybeSingle();
    team = data as typeof team;
  }

  return <ProfileScreen profile={profile} team={team} />;
}
