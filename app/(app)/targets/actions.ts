"use server";

import { refresh } from "next/cache";
import { guardedAction } from "@/lib/actions";
import { logAuditMany } from "@/lib/audit";
import { friendlyDbError } from "@/lib/db-errors";
import { parsePKR } from "@/lib/format/money";
import { isMonthStart, karachiMonthStart } from "@/lib/format/months";
import type { ActionState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Saves the target grid. Fields are named `t:<teamId>:<YYYY-MM-01>`. Only
 * changed cells are written; each change is audited with its old and new amount.
 */
export async function saveTargets(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guardedAction(["superadmin"], async (actorId) => {
    const thisMonth = karachiMonthStart();
    const cells: { team_id: string; month: string; amount_pkr: number }[] = [];
    const fieldErrors: Record<string, string[]> = {};

    for (const [name, raw] of formData.entries()) {
      if (typeof raw !== "string" || !name.startsWith("t:")) continue;
      const [, teamId, month] = name.split(":");
      if (!UUID.test(teamId ?? "") || !isMonthStart(month ?? "")) continue;
      if (raw.trim() === "") continue;
      if (month < thisMonth) {
        fieldErrors[name] = ["Targets for past months are locked."];
        continue;
      }
      const amount = parsePKR(raw);
      if (amount === null) {
        fieldErrors[name] = ["Enter a whole number of rupees, for example 2,500,000."];
        continue;
      }
      cells.push({ team_id: teamId, month, amount_pkr: amount });
    }
    if (Object.keys(fieldErrors).length > 0) {
      return { ok: false, message: "Some targets need attention.", fieldErrors };
    }

    const supabase = await createClient();
    const months = [...new Set(cells.map((c) => c.month))];
    const { data: existing } = await supabase
      .from("targets")
      .select("team_id, month, amount_pkr")
      .in("month", months.length ? months : [thisMonth]);
    const before = new Map((existing ?? []).map((t) => [`${t.team_id}:${t.month}`, Number(t.amount_pkr)]));

    const changed = cells.filter((c) => before.get(`${c.team_id}:${c.month}`) !== c.amount_pkr);
    if (changed.length === 0) return { ok: true, message: "No changes to save." };

    const { error } = await supabase.from("targets").upsert(changed, { onConflict: "team_id,month" });
    if (error) {
      return {
        ok: false,
        message: error.message.includes("past months") ? "Targets for past months are locked." : friendlyDbError(error),
      };
    }
    await logAuditMany(
      changed.map((c) => ({
        actorId,
        action: "target.set",
        entity: "target",
        entityId: `${c.team_id}:${c.month}`,
        meta: {
          team_id: c.team_id,
          month: c.month,
          old: before.get(`${c.team_id}:${c.month}`) ?? null,
          new: c.amount_pkr,
        },
      })),
    );
    refresh();
    return { ok: true, message: `${changed.length} ${changed.length === 1 ? "target" : "targets"} saved.` };
  });
}
