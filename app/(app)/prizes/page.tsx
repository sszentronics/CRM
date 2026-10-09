import type { Metadata } from "next";
import { PrizesScreen } from "@/components/features/prizes/prizes-screen";
import { NoAccess } from "@/components/features/shell/no-access";
import { requireAccess } from "@/lib/auth/session";
import { addMonths, karachiMonthStart } from "@/lib/format/months";
import { createClient } from "@/lib/supabase/server";
import type { TeamColor } from "@/lib/teams";

export const metadata: Metadata = { title: "Team prizes" };

export default async function PrizesPage() {
  if (!(await requireAccess("/prizes"))) return <NoAccess />;
  const thisMonth = karachiMonthStart();
  const months = [thisMonth, addMonths(thisMonth, 1), addMonths(thisMonth, 2)];
  const supabase = await createClient();
  const [{ data: teams }, { data: prizes }, { data: targets }] = await Promise.all([
    supabase.from("teams").select("id, name, color").eq("is_active", true).order("name"),
    supabase.from("team_prizes").select("team_id, month, prize").in("month", months),
    supabase.from("targets").select("team_id, month, amount_pkr").in("month", months),
  ]);
  const values: Record<string, string> = {};
  for (const p of prizes ?? []) values[`${p.team_id}:${p.month}`] = p.prize as string;
  const targetOf: Record<string, number> = {};
  for (const t of targets ?? []) targetOf[`${t.team_id}:${t.month}`] = Number(t.amount_pkr);
  return <PrizesScreen teams={(teams ?? []) as { id: string; name: string; color: TeamColor }[]} months={months} values={values} targets={targetOf} />;
}
