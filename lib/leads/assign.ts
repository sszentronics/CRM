import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { UserFacingError } from "@/lib/errors";

/** Messages our assignment functions raise are written for people; anything else becomes a plain retry message. */
function friendly(error: { code?: string; message?: string }): string {
  if (error.code === "P0001" || error.code === "42501") return error.message ?? "That move is not allowed.";
  return "The leads could not be moved. Try again.";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lead ids from the client: deduplicated, well-formed, and a sensible batch size. */
export function cleanIds(ids: unknown, max = 2000): string[] {
  if (!Array.isArray(ids)) throw new UserFacingError("Choose at least one lead.");
  const out = [...new Set(ids.filter((i): i is string => typeof i === "string" && UUID.test(i)))];
  if (out.length === 0) throw new UserFacingError("Choose at least one lead.");
  if (out.length > max) throw new UserFacingError(`Move up to ${max.toLocaleString("en-US")} leads at a time.`);
  return out;
}

export function cleanId(id: unknown, what: string): string {
  if (typeof id !== "string" || !UUID.test(id)) throw new UserFacingError(`Choose ${what}.`);
  return id;
}

export function cleanReason(reason: unknown): string | null {
  const r = typeof reason === "string" ? reason.trim() : "";
  if (r.length > 300) throw new UserFacingError("Keep the reason under 300 characters.");
  return r || null;
}

/** Pool to team, or team to team. Runs as the caller, so row-level security applies. */
export async function assignToTeam(supabase: SupabaseClient, leadIds: string[], teamId: string, reason: string | null) {
  const { data, error } = await supabase.rpc("assign_leads_to_team", {
    p_lead_ids: leadIds,
    p_team_id: teamId,
    p_reason: reason,
  });
  if (error) throw new UserFacingError(friendly(error));
  return Number(data ?? 0);
}

/** Team to agent. Runs as the caller, so row-level security applies. */
export async function assignToAgent(supabase: SupabaseClient, leadIds: string[], agentId: string, reason: string | null) {
  const { data, error } = await supabase.rpc("assign_leads_to_agent", {
    p_lead_ids: leadIds,
    p_agent_id: agentId,
    p_reason: reason,
  });
  if (error) throw new UserFacingError(friendly(error));
  return Number(data ?? 0);
}

/** Open leads of a disabled person go back to their Team Lead's unassigned list. */
export async function returnOpenLeads(supabase: SupabaseClient, userId: string, reason: string) {
  const { data, error } = await supabase.rpc("return_open_leads", { p_user: userId, p_reason: reason });
  if (error) throw new UserFacingError(friendly(error));
  return Number(data ?? 0);
}
