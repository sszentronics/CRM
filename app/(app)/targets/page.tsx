import type { Metadata } from "next";
import { TargetsScreen } from "@/components/features/targets/targets-screen";
import { NoAccess } from "@/components/features/shell/no-access";
import { requireAccess } from "@/lib/auth/session";
import { addMonths, karachiMonthStart } from "@/lib/format/months";
import { createClient } from "@/lib/supabase/server";
import type { TeamColor } from "@/lib/teams";

export const metadata: Metadata = { title: "Targets" };

/** Two past months for reference, this month, and three ahead. */
const MONTHS_BACK = 2;
const MONTHS_AHEAD = 3;

export default async function TargetsPage() {
  if (!(await requireAccess("/targets"))) return <NoAccess />;

  const thisMonth = karachiMonthStart();
  const months = Array.from({ length: MONTHS_BACK + 1 + MONTHS_AHEAD }, (_, i) => addMonths(thisMonth, i - MONTHS_BACK));

  const supabase = await createClient();
  const [{ data: teams }, { data: targets }] = await Promise.all([
    supabase.from("teams").select("id, name, color").eq("is_active", true).order("name"),
    supabase.from("targets").select("team_id, month, amount_pkr").in("month", months),
  ]);

  const values: Record<string, number> = {};
  for (const t of targets ?? []) values[`${t.team_id}:${t.month}`] = Number(t.amount_pkr);

  return (
    <TargetsScreen
      teams={(teams ?? []) as { id: string; name: string; color: TeamColor }[]}
      months={months}
      thisMonth={thisMonth}
      values={values}
    />
  );
}
