"use server";

import { refresh } from "next/cache";
import { PermissionError, requireActor } from "@/lib/auth/actor";
import type { Role } from "@/lib/auth/roles";
import { logAudit } from "@/lib/audit";
import { UserFacingError } from "@/lib/errors";
import { assignToAgent, cleanId, cleanIds, cleanReason } from "@/lib/leads/assign";
import { planEvenDistribution, type PoolLead } from "@/lib/leads/distribution";
import { createClient } from "@/lib/supabase/server";

/** Team Leads assign within their team; Admin and Superadmin may do the same for any team. */
const ASSIGNERS: Role[] = ["team_lead", "admin", "superadmin"];

type Result = { ok: true; message: string } | { ok: false; message: string };

async function asAssigner(run: (actorId: string) => Promise<Result>): Promise<Result> {
  try {
    const actor = await requireActor(ASSIGNERS);
    return await run(actor.id);
  } catch (err) {
    if (err instanceof PermissionError || err instanceof UserFacingError) return { ok: false, message: err.message };
    throw err;
  }
}

async function firstName(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data } = await supabase.from("profiles_public").select("full_name").eq("id", id).maybeSingle();
  return (data?.full_name as string | undefined)?.split(" ")[0] ?? "them";
}

/** Assign or reassign leads to one person. Reassigning needs a reason (checked again in the database). */
export async function assignLeads(leadIds: string[], agentId: string, reason?: string): Promise<Result> {
  return asAssigner(async (actorId) => {
    const ids = cleanIds(leadIds);
    const agent = cleanId(agentId, "who gets the leads");
    const why = cleanReason(reason);
    const supabase = await createClient();
    const moved = await assignToAgent(supabase, ids, agent, why);
    await logAudit({
      actorId,
      action: why ? "lead.reassign" : "lead.assign_agent",
      entity: "profile",
      entityId: agent,
      meta: { leads: ids.length, moved, reason: why },
    });
    refresh();
    const who = agent === actorId ? "you" : await firstName(supabase, agent);
    return {
      ok: true,
      message: `${moved} ${moved === 1 ? "lead" : "leads"} assigned to ${who}.${agent === actorId ? "" : " They have been told."}`,
    };
  });
}

/** Split the chosen leads evenly between the chosen people, balancing sources too. */
export async function splitEvenly(leadIds: string[], agentIds: string[]): Promise<Result> {
  return asAssigner(async (actorId) => {
    const ids = cleanIds(leadIds);
    const people = cleanIds(agentIds, 50);
    const supabase = await createClient();
    const { data } = await supabase
      .from("leads")
      .select("id, source, created_at")
      .in("id", ids)
      .is("agent_id", null);
    const leads = (data ?? []) as PoolLead[];
    if (leads.length === 0) throw new UserFacingError("Those leads already have someone. Refresh the list.");

    const plan = planEvenDistribution(leads, people);
    let moved = 0;
    for (const person of people) {
      if (plan[person].length > 0) moved += await assignToAgent(supabase, plan[person], person, null);
    }
    await logAudit({
      actorId,
      action: "lead.split_evenly",
      entity: "lead",
      entityId: null,
      meta: { moved, people: Object.fromEntries(Object.entries(plan).map(([k, v]) => [k, v.length])) },
    });
    refresh();
    return { ok: true, message: `${moved} ${moved === 1 ? "lead" : "leads"} split between ${people.length} ${people.length === 1 ? "person" : "people"}. ${people.length === 1 ? "They have" : "Each of them has"} been told.` };
  });
}
