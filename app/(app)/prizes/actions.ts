"use server";

import { refresh } from "next/cache";
import { guardedAction } from "@/lib/actions";
import { logAuditMany } from "@/lib/audit";
import { friendlyDbError } from "@/lib/db-errors";
import { isMonthStart, karachiMonthStart } from "@/lib/format/months";
import type { ActionState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Saves the prize grid. Fields are named `p:<teamId>:<YYYY-MM-01>`. A blank box removes that
 * month's prize. Each change is audited with the old and new text.
 */
export async function savePrizes(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guardedAction(["superadmin", "admin"], async (actorId) => {
    const thisMonth = karachiMonthStart();
    const wanted = new Map<string, { team_id: string; month: string; prize: string }>();
    const fieldErrors: Record<string, string[]> = {};
    const cleared: { team_id: string; month: string }[] = [];

    for (const [name, raw] of formData.entries()) {
      if (typeof raw !== "string" || !name.startsWith("p:")) continue;
      const [, teamId, month] = name.split(":");
      if (!UUID.test(teamId ?? "") || !isMonthStart(month ?? "") || month < thisMonth) continue;
      const prize = raw.trim();
      if (prize === "") {
        cleared.push({ team_id: teamId, month });
      } else if (prize.length < 2 || prize.length > 80) {
        fieldErrors[name] = ["Describe the prize in 2 to 80 characters, for example Team dinner."];
      } else {
        wanted.set(`${teamId}:${month}`, { team_id: teamId, month, prize });
      }
    }
    if (Object.keys(fieldErrors).length > 0) return { ok: false, message: "Some prizes need attention.", fieldErrors };

    const supabase = await createClient();
    const { data: existing } = await supabase.from("team_prizes").select("team_id, month, prize").gte("month", thisMonth);
    const before = new Map((existing ?? []).map((p) => [`${p.team_id}:${p.month}`, p.prize as string]));

    const changed = [...wanted.values()].filter((w) => before.get(`${w.team_id}:${w.month}`) !== w.prize);
    const removed = cleared.filter((c) => before.has(`${c.team_id}:${c.month}`));
    if (changed.length + removed.length === 0) return { ok: true, message: "No changes to save." };

    if (changed.length > 0) {
      const { error } = await supabase
        .from("team_prizes")
        .upsert(changed.map((c) => ({ ...c, set_by: actorId })), { onConflict: "team_id,month" });
      if (error) return { ok: false, message: friendlyDbError(error) };
    }
    for (const r of removed) {
      const { error } = await supabase.from("team_prizes").delete().eq("team_id", r.team_id).eq("month", r.month);
      if (error) return { ok: false, message: friendlyDbError(error) };
    }
    await logAuditMany([
      ...changed.map((c) => ({
        actorId,
        action: "prize.set",
        entity: "team_prize",
        entityId: `${c.team_id}:${c.month}`,
        meta: { team_id: c.team_id, month: c.month, old: before.get(`${c.team_id}:${c.month}`) ?? null, new: c.prize },
      })),
      ...removed.map((r) => ({
        actorId,
        action: "prize.remove",
        entity: "team_prize",
        entityId: `${r.team_id}:${r.month}`,
        meta: { team_id: r.team_id, month: r.month, old: before.get(`${r.team_id}:${r.month}`) ?? null },
      })),
    ]);
    refresh();
    const n = changed.length + removed.length;
    return { ok: true, message: `${n} ${n === 1 ? "prize" : "prizes"} saved.` };
  });
}
