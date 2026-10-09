"use server";

import { refresh } from "next/cache";
import { PermissionError, requireActor } from "@/lib/auth/actor";
import { ROLES } from "@/lib/auth/roles";
import { describeWhen } from "@/lib/format/dates";
import type { ActionState } from "@/lib/forms";
import { decideSessionOutcome, MODES, sessionReportErrors, type Mode } from "@/lib/sessions/rules";
import type { Stage } from "@/lib/leads/stages";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class SessionError extends Error {}

async function run(fn: () => Promise<ActionState>): Promise<ActionState> {
  try {
    await requireActor(ROLES);
    return await fn();
  } catch (err) {
    if (err instanceof PermissionError || err instanceof SessionError) return { ok: false, message: err.message };
    throw err;
  }
}

/** Call a session function. Messages it raises are written for people. */
async function rpc(name: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  const { error } = await supabase.rpc(name, args);
  if (error) {
    throw new SessionError(error.code === "P0001" || error.code === "42501" ? error.message : "That could not be saved. Try again.");
  }
}

const id = (fd: FormData, key: string) => {
  const v = String(fd.get(key) ?? "");
  if (!UUID.test(v)) throw new SessionError("Refresh the page and try again.");
  return v;
};
const text = (fd: FormData, key: string, max: number) => String(fd.get(key) ?? "").trim().slice(0, max);
const date = (fd: FormData, key: string) => {
  const raw = text(fd, key, 40);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};
const mode = (fd: FormData): Mode => {
  const m = text(fd, "mode", 10) as Mode;
  return MODES.some((x) => x.value === m) ? m : "office";
};

/** Agent, Team Lead or Admin refers an interested client. Moves the lead to with_analyst. */
export async function referLead(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const leadId = id(formData, "leadId");
    const analyst = text(formData, "analystId", 40);
    const note = text(formData, "note", 1000);
    if (note.length < 3) {
      const m = "Add a note for the analyst: what does the client want to know?";
      return { ok: false, message: m, fieldErrors: { note: [m] } };
    }
    await rpc("refer_to_analyst", {
      p_lead_id: leadId,
      p_analyst_id: UUID.test(analyst) ? analyst : null,
      p_preferred_at: date(formData, "preferredAt")?.toISOString() ?? null,
      p_mode: mode(formData),
      p_note: note,
    });
    refresh();
    return {
      ok: true,
      message: UUID.test(analyst)
        ? "Referred. The analyst has been told and will book a time."
        : "Referred. Every analyst has been told; the first to accept takes it.",
    };
  });
}

export async function acceptReferral(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    await rpc("accept_referral", { p_session_id: id(formData, "sessionId") });
    refresh();
    return { ok: true, message: "Referral accepted. Book the session time next." };
  });
}

export async function scheduleSession(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const when = date(formData, "scheduledAt");
    if (!when) {
      const m = "Choose the session date and time.";
      return { ok: false, message: m, fieldErrors: { scheduledAt: [m] } };
    }
    await rpc("schedule_session", { p_session_id: id(formData, "sessionId"), p_scheduled_at: when.toISOString(), p_mode: mode(formData) });
    refresh();
    return { ok: true, message: `Session booked for ${describeWhen(when)}. The agent has been told.` };
  });
}

/** "Save and hand back": the outcome, the report, and the end of the analyst's access. */
export async function recordOutcome(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const sessionId = id(formData, "sessionId");
    const raw = text(formData, "outcome", 20);
    const outcome: "attended" | "no_show" | null = raw === "attended" || raw === "no_show" ? raw : null;
    const report = {
      outcome,
      clientLevel: text(formData, "clientLevel", 30),
      interestLevel: text(formData, "interestLevel", 30),
      notes: text(formData, "notes", 3000),
      nextStep: text(formData, "nextStep", 300),
    };
    const errors = sessionReportErrors(report);
    if (Object.keys(errors).length > 0) {
      return {
        ok: false,
        message: "Some fields need attention.",
        fieldErrors: Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, [v!]])),
      };
    }
    // The stage machine's view of what happens; the database applies the same rule.
    const stage = text(formData, "stage", 30) as Stage;
    try {
      decideSessionOutcome(outcome!, stage, sessionId);
    } catch {
      return { ok: false, message: "This lead has moved on. Refresh the page." };
    }

    await rpc("record_session_outcome", {
      p_session_id: sessionId,
      p_outcome: outcome,
      p_client_level: report.clientLevel || null,
      p_interest_level: report.interestLevel || null,
      p_notes: report.notes || null,
      p_next_step: report.nextStep || null,
    });
    refresh();
    return {
      ok: true,
      message:
        outcome === "attended"
          ? "Handed back. The agent has your notes, and you are credited for this client."
          : "Handed back as a no-show. The agent will rebook or move on.",
      data: { handedBack: true },
    };
  });
}

export async function cancelReferral(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    await rpc("cancel_referral", { p_session_id: id(formData, "sessionId"), p_reason: text(formData, "reason", 200) || null });
    refresh();
    return { ok: true, message: "Referral cancelled. The lead is back to Interested." };
  });
}
