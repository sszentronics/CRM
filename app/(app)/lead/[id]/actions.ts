"use server";

import { refresh } from "next/cache";
import { PermissionError, requireActor } from "@/lib/auth/actor";
import { ROLES } from "@/lib/auth/roles";
import { describeWhen } from "@/lib/format/dates";
import type { ActionState } from "@/lib/forms";
import { CHANNEL_LABEL, isTemperature, LOGGABLE_CHANNELS, TEMPERATURE_LABEL, type Temperature } from "@/lib/leads/contact";
import {
  CALL_OUTCOMES,
  decideCall,
  decideMove,
  LeadRuleError,
  StageTransitionError,
  type CallOutcome,
} from "@/lib/leads/stage-machine";
import { STAGE_LABEL, STAGES, type Stage } from "@/lib/leads/stages";
import { getSetting } from "@/lib/settings/get-setting";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Event = {
  leadId: string;
  expectedStage: Stage;
  type: "call" | "whatsapp" | "note" | "stage_change";
  newStage?: Stage | null;
  outcome?: CallOutcome | null;
  notes?: string | null;
  followUpAt?: Date | null;
  reason?: string | null;
  noAnswerIncrement?: number;
  releaseAgent?: boolean;
};

class EventError extends Error {}

/** Apply one event through the database. It checks access and the stage rules again. */
async function record(e: Event) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_lead_event", {
    p_lead_id: e.leadId,
    p_expected_stage: e.expectedStage,
    p_type: e.type,
    p_new_stage: e.newStage ?? null,
    p_outcome: e.outcome ?? null,
    p_notes: e.notes ?? null,
    p_next_follow_up_at: e.followUpAt?.toISOString() ?? null,
    p_close_reason: e.reason ?? null,
    p_no_answer_increment: e.noAnswerIncrement ?? 0,
    p_release_agent: e.releaseAgent ?? false,
  });
  if (error) {
    throw new EventError(
      error.code === "P0001" || error.code === "42501" ? error.message : "That could not be saved. Try again.",
    );
  }
}

/** Hot, warm or cold, through the database (it checks who may work the lead and writes the log). */
async function applyTemperature(leadId: string, temperature: Temperature) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_lead_temperature", { p_lead_id: leadId, p_temperature: temperature });
  if (error) {
    throw new EventError(
      error.code === "P0001" || error.code === "42501" ? error.message : "That could not be saved. Try again.",
    );
  }
}

/** Every action here: signed in, then rule and access errors become messages. */
async function run(fn: () => Promise<ActionState>): Promise<ActionState> {
  try {
    await requireActor(ROLES);
    return await fn();
  } catch (err) {
    if (err instanceof LeadRuleError) {
      return { ok: false, message: err.message, fieldErrors: err.field ? { [err.field]: [err.message] } : undefined };
    }
    if (err instanceof StageTransitionError) return { ok: false, message: "That move is not allowed from this stage." };
    if (err instanceof PermissionError || err instanceof EventError) return { ok: false, message: err.message };
    throw err;
  }
}

function readLeadId(formData: FormData) {
  const id = String(formData.get("leadId") ?? "");
  if (!UUID.test(id)) throw new EventError("This lead could not be found.");
  return id;
}

function readStage(formData: FormData, key = "stage"): Stage {
  const s = String(formData.get(key) ?? "") as Stage;
  if (!STAGES.includes(s)) throw new EventError("Refresh the page and try again.");
  return s;
}

function readDate(formData: FormData, key = "followUpAt"): Date | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function readText(formData: FormData, key: string, max: number) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

/** Log a call: the stage machine decides the outcome, the database applies it. */
export async function logCall(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const leadId = readLeadId(formData);
    const stage = readStage(formData);
    const rawOutcome = String(formData.get("outcome") ?? "");
    const outcome = (CALL_OUTCOMES as readonly string[]).includes(rawOutcome) ? (rawOutcome as CallOutcome) : null;

    const supabase = await createClient();
    const [{ data: lead }, maxTries] = await Promise.all([
      supabase.from("leads").select("no_answer_count").eq("id", leadId).maybeSingle(),
      getSetting(supabase, "max_call_tries"),
    ]);
    if (!lead) throw new EventError("This lead belongs to another team.");

    const decision = decideCall({
      stage,
      noAnswerCount: lead.no_answer_count as number,
      maxTries,
      outcome,
      notes: readText(formData, "notes", 2000),
      followUpAt: readDate(formData),
      reason: readText(formData, "reason", 120),
    });
    await record({
      leadId,
      expectedStage: stage,
      type: "call",
      newStage: decision.newStage,
      outcome,
      notes: readText(formData, "notes", 2000),
      followUpAt: decision.followUpAt,
      reason: decision.reason,
      noAnswerIncrement: decision.noAnswerIncrement,
      releaseAgent: decision.releaseAgent,
    });
    // The interest picked in the sheet is saved with the call. The call is already safe if this fails.
    const interest = String(formData.get("temperature") ?? "");
    if (isTemperature(interest)) await applyTemperature(leadId, interest);
    refresh();

    let message: string;
    if (decision.releaseAgent) message = `No answer ${maxTries} times. Sent back to your Team Lead.`;
    else if (decision.newStage === "invalid") message = "Marked invalid. Your Team Lead will confirm it.";
    else if (decision.newStage === "not_interested") message = `Call saved. Lead closed: ${decision.reason}.`;
    else message = `Call saved. Next follow-up ${describeWhen(decision.followUpAt!)}.`;
    return { ok: true, message, data: { released: decision.releaseAgent } };
  });
}

/** A stage button that is not a call, for example Interested to Documents pending. */
export async function moveStage(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const leadId = readLeadId(formData);
    const from = readStage(formData);
    const to = readStage(formData, "to");
    const d = decideMove(from, to, readDate(formData), readText(formData, "reason", 120) || null);
    await record({
      leadId,
      expectedStage: from,
      type: "stage_change",
      newStage: d.newStage,
      notes: readText(formData, "notes", 2000) || null,
      followUpAt: d.followUpAt,
      reason: d.reason,
    });
    refresh();
    return {
      ok: true,
      message: `Moved to ${STAGE_LABEL[to]}.${d.followUpAt ? ` Next follow-up ${describeWhen(d.followUpAt)}.` : ""}`,
    };
  });
}

/** A note on the timeline. A Team Lead's note to the agent also notifies them. */
export async function addNote(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const leadId = readLeadId(formData);
    const stage = readStage(formData);
    const notes = readText(formData, "notes", 2000);
    if (!notes) throw new LeadRuleError("Write the note first.", "notes");
    await record({ leadId, expectedStage: stage, type: "note", notes });
    refresh();
    return { ok: true, message: "Note added." };
  });
}

/** WhatsApp was opened from the contact strip. */
export async function logWhatsApp(leadId: string, stage: Stage): Promise<void> {
  if (!UUID.test(leadId) || !STAGES.includes(stage)) return;
  try {
    await requireActor(ROLES);
    await record({ leadId, expectedStage: stage, type: "whatsapp", notes: "Opened WhatsApp" });
  } catch {
    // Logging the WhatsApp tap must never get in the way of the chat.
  }
}

/** The Team Lead rejects an agent's Invalid mark: the lead goes back to follow-up. */
export async function rejectInvalid(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const leadId = readLeadId(formData);
    const d = decideMove("invalid", "follow_up", readDate(formData), null);
    await record({
      leadId,
      expectedStage: "invalid",
      type: "stage_change",
      newStage: "follow_up",
      notes: readText(formData, "notes", 2000) || "Invalid mark rejected.",
      followUpAt: d.followUpAt,
    });
    refresh();
    return { ok: true, message: `Back to follow-up. Next call ${describeWhen(d.followUpAt!)}.` };
  });
}

export async function confirmInvalid(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const leadId = readLeadId(formData);
    const supabase = await createClient();
    const { error } = await supabase.rpc("confirm_invalid", { p_lead_id: leadId });
    if (error) throw new EventError(error.code === "P0001" || error.code === "42501" ? error.message : "That could not be saved.");
    refresh();
    return { ok: true, message: "Invalid mark confirmed. The lead stays closed." };
  });
}

/** Admin only: a Not interested lead goes back to the pool after the cooling-off period. */
export async function returnToPool(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const leadId = readLeadId(formData);
    decideMove("not_interested", "new", null, null);
    await record({
      leadId,
      expectedStage: "not_interested",
      type: "stage_change",
      newStage: "new",
      notes: "Returned to the pool after the cooling-off period.",
    });
    refresh();
    return { ok: true, message: "Back in the pool, ready to distribute again." };
  });
}

/** Set how willing the lead is to invest: Hot, Warm or Cold. */
export async function setInterest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const leadId = readLeadId(formData);
    const value = String(formData.get("temperature") ?? "");
    if (!isTemperature(value)) throw new LeadRuleError("Choose Hot, Warm or Cold.", "temperature");
    await applyTemperature(leadId, value);
    refresh();
    return { ok: true, message: `Interest set to ${TEMPERATURE_LABEL[value]}.` };
  });
}

/** A WhatsApp, message or email to the lead, with the interest level if the agent picked one. */
export async function logContact(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const leadId = readLeadId(formData);
    const channel = String(formData.get("channel") ?? "");
    if (!(LOGGABLE_CHANNELS as readonly string[]).includes(channel)) {
      throw new LeadRuleError("Choose how you contacted them.", "channel");
    }
    const supabase = await createClient();
    const { error } = await supabase.rpc("log_contact", {
      p_lead_id: leadId,
      p_channel: channel,
      p_notes: readText(formData, "notes", 2000) || null,
    });
    if (error) {
      throw new EventError(error.code === "P0001" || error.code === "42501" ? error.message : "That could not be saved. Try again.");
    }
    const interest = String(formData.get("temperature") ?? "");
    if (isTemperature(interest)) await applyTemperature(leadId, interest);
    refresh();
    return { ok: true, message: `${CHANNEL_LABEL[channel as keyof typeof CHANNEL_LABEL]} logged.` };
  });
}
