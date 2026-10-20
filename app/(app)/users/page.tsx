import type { Metadata } from "next";
import { NoAccess } from "@/components/features/shell/no-access";
import { UsersScreen, type PersonRow, type TeamRow } from "@/components/features/users/users-screen";
import { requireAccess } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Users and teams" };

/** The API returns at most 1,000 rows a request, so read the people list a page at a time rather than silently dropping the rest. */
const PAGE = 1000;

async function allPeople(supabase: Awaited<ReturnType<typeof createClient>>): Promise<PersonRow[]> {
  const rows: PersonRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email, phone, role, team_id, photo_url, is_active, created_at")
      .order("full_name")
      .order("id")
      .range(from, from + PAGE - 1);
    rows.push(...((data ?? []) as PersonRow[]));
    if (!data || data.length < PAGE) return rows;
  }
}

export default async function UsersPage() {
  const ctx = await requireAccess("/users");
  if (!ctx) return <NoAccess />;

  const supabase = await createClient();
  const [people, { data: teams }] = await Promise.all([
    allPeople(supabase),
    supabase.from("teams").select("id, name, color, team_lead_id, is_active, created_at").order("name"),
  ]);

  return (
    <UsersScreen
      people={people}
      teams={(teams ?? []) as TeamRow[]}
      currentUserId={ctx.userId}
      currentRole={ctx.profile.role}
    />
  );
}
