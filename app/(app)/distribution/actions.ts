"use server";

import { refresh } from "next/cache";
import { PermissionError, requireActor } from "@/lib/auth/actor";
import type { Role } from "@/lib/auth/roles";
import { logAudit } from "@/lib/audit";
import { UserFacingError } from "@/lib/errors";
import { assignToTeam, cleanId, cleanIds, cleanReason } from "@/lib/leads/assign";
import { planEvenDistribution, summarisePlan, type PoolLead } from "@/lib/leads/distribution";
import { createClient } from "@/lib/supabase/server";

const ADMINS: Role[] = ["superadmin", "admin"];

type Fail = { ok: false; message: string };

async function asAdmin<T>(run: (actorId: string) => Promise<T>): Promise<T | Fail> {
  try {
    const actor = await requireActor(ADMINS);
    return await run(actor.id);
  } catch (err) {
    if (err instanceof PermissionError || err instanceof UserFacingError) return { ok: false, message: err.message };
    throw err;
  }
}

/** Load the chosen pool leads and active teams, exactly as the database has them now. */
async function loadPlanInputs(leadIds: unknown, teamIds: unknown) {
  const ids = cleanIds(leadIds);
  const teams = cleanIds(teamIds, 50);
  const supabase = await createClient();
  const [{ data: leads }, { data: teamRows }] = await Promise.all([
    supabase.from("leads").select("id, source, created_at").in("id", ids).is("team_id", null).eq("stage", "new"),
    supabase.from("teams").select("id, name, color").in("id", teams).eq("is_active", true).order("name"),
  ]);
  const pool = (leads ?? []) as PoolLead[];
  if (pool.length === 0) throw new UserFacingError("None of those leads are in the pool any more. Refresh the list.");
  if (!teamRows || teamRows.length === 0) throw new UserFacingError("Choose at least one active team.");
  const order = teamRows.map((t) => t.id as string);
  return { supabase, pool, teamRows, plan: planEvenDistribution(pool, order) };
}

export type DistributionPreview =
  | {
      ok: true;
      leadCount: number;
      sources: string[];
      rows: { teamId: string; name: string; color: string; total: number; bySource: Record<string, number> }[];
    }
  | Fail;

/** Step one of "Distribute evenly": the plan, with nothing written. */
export async function previewDistribution(leadIds: string[], teamIds: string[]): Promise<DistributionPreview> {
  return asAdmin(async () => {
    const { pool, teamRows, plan } = await loadPlanInputs(leadIds, teamIds);
    const { sources, rows } = summarisePlan(plan, pool);
    const byId = new Map(teamRows.map((t) => [t.id as string, t]));
    return {
      ok: true as const,
      leadCount: pool.length,
      sources,
      rows: rows.map((r) => ({ ...r, name: byId.get(r.teamId)!.name as string, color: byId.get(r.teamId)!.color as string })),
    };
  });
}

/** Step two: the same plan, recomputed from the database, then written team by team. */
export async function confirmDistribution(leadIds: string[], teamIds: string[]): Promise<{ ok: true; moved: number } | Fail> {
  return asAdmin(async (actorId) => {
    const { supabase, plan, teamRows } = await loadPlanInputs(leadIds, teamIds);
    let moved = 0;
    for (const t of teamRows) {
      const ids = plan[t.id as string];
      if (ids.length > 0) moved += await assignToTeam(supabase, ids, t.id as string, null);
    }
    await logAudit({
      actorId,
      action: "lead.distribute",
      entity: "lead",
      entityId: null,
      meta: { moved, teams: Object.fromEntries(Object.entries(plan).map(([k, v]) => [k, v.length])) },
    });
    refresh();
    return { ok: true as const, moved };
  });
}

/** Send leads to one team: from the pool, or a move from another team (which needs a reason). */
export async function sendToTeam(
  leadIds: string[],
  teamId: string,
  reason?: string,
): Promise<{ ok: true; moved: number; message: string } | Fail> {
  return asAdmin(async (actorId) => {
    const ids = cleanIds(leadIds);
    const team = cleanId(teamId, "a team");
    const why = cleanReason(reason);
    const supabase = await createClient();
    const moved = await assignToTeam(supabase, ids, team, why);
    const { data: t } = await supabase.from("teams").select("name").eq("id", team).single();
    await logAudit({
      actorId,
      action: why ? "lead.move_team" : "lead.assign_team",
      entity: "team",
      entityId: team,
      meta: { leads: ids.length, moved, reason: why },
    });
    refresh();
    return {
      ok: true as const,
      moved,
      message: `${moved} ${moved === 1 ? "lead" : "leads"} sent to ${t?.name ?? "the team"}. Its Team Lead has been told.`,
    };
  });
}
