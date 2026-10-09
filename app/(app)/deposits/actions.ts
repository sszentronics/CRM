"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { PermissionError, requireActor } from "@/lib/auth/actor";
import type { Role } from "@/lib/auth/roles";
import { depositFormSchema, reasonSchema } from "@/lib/deposits/rules";
import { dateToKarachiInput } from "@/lib/format/dates";
import { formatPKR } from "@/lib/format/money";
import { fieldErrors, type ActionState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const OWNERS: Role[] = ["superadmin", "admin", "team_lead", "agent"];
const ADMINS: Role[] = ["superadmin", "admin"];

class DepositError extends Error {}

async function run(roles: readonly Role[], fn: () => Promise<ActionState>): Promise<ActionState> {
  try {
    await requireActor(roles);
    return await fn();
  } catch (err) {
    if (err instanceof PermissionError || err instanceof DepositError) return { ok: false, message: err.message };
    throw err;
  }
}

/** Call a deposit function. Messages it raises are written for people; anything else is generic. */
async function rpc(name: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    throw new DepositError(error.code === "P0001" || error.code === "42501" ? error.message : "That could not be saved. Try again.");
  }
  return data;
}

/** Keeps empty fields as empty strings so the form schemas can say what is missing. */
const rawForm = (fd: FormData) => Object.fromEntries([...fd.entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""]));

const idSchema = z.object({ depositId: z.uuid() });
const REFRESH = "Refresh the page and try again.";

/** Agent, Team Lead or Admin records money received. It waits for an Admin who did not record it. */
export async function recordDeposit(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(OWNERS, async () => {
    const leadId = z.uuid().safeParse(formData.get("leadId"));
    if (!leadId.success) throw new DepositError(REFRESH);
    const today = dateToKarachiInput(new Date()).slice(0, 10);
    const parsed = depositFormSchema(today).safeParse(rawForm(formData));
    if (!parsed.success) return fieldErrors(parsed.error);
    const v = parsed.data;

    try {
      await rpc("record_deposit", { p_lead_id: leadId.data, p_amount: v.amount, p_date: v.date, p_method: v.method, p_reference: v.reference });
    } catch (err) {
      if (err instanceof DepositError && /reference/i.test(err.message)) return { ok: false, message: err.message, fieldErrors: { reference: [err.message] } };
      throw err;
    }
    refresh();
    return { ok: true, message: `${formatPKR(v.amount)} recorded. An Admin will check it against the statement.` };
  });
}

const verifySchema = idSchema.extend({ statementChecked: z.literal("on", "Confirm the reference, amount and date match the statement first.") });

/** Admin: verify a pending deposit once the statement matches. */
export async function verifyDeposit(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(ADMINS, async () => {
    const parsed = verifySchema.safeParse(rawForm(formData));
    if (!parsed.success) {
      const checkbox = parsed.error.issues.find((i) => i.path[0] === "statementChecked");
      throw new DepositError(checkbox ? checkbox.message : REFRESH);
    }
    await rpc("verify_deposit", { p_deposit_id: parsed.data.depositId, p_statement_checked: true });
    refresh();
    return { ok: true, message: "Verified. It now counts on the boards." };
  });
}

const reasonForm = idSchema.extend({ reason: reasonSchema });

async function withReason(formData: FormData, fn: string, done: string): Promise<ActionState> {
  const parsed = reasonForm.safeParse(rawForm(formData));
  if (!parsed.success) {
    const idBad = parsed.error.issues.some((i) => i.path[0] === "depositId");
    if (idBad) throw new DepositError(REFRESH);
    return fieldErrors(parsed.error);
  }
  await rpc(fn, { p_deposit_id: parsed.data.depositId, p_reason: parsed.data.reason });
  refresh();
  return { ok: true, message: done };
}

/** Admin: reject a pending deposit with a reason. A rejected first deposit sends the lead back to documents. */
export async function rejectDeposit(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(ADMINS, () => withReason(formData, "reject_deposit", "Rejected. The agent has been told why."));
}

/** Admin: reverse a verified deposit. It comes off every total. */
export async function reverseDeposit(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(ADMINS, () => withReason(formData, "reverse_deposit", "Reversed. It no longer counts."));
}

const questionForm = idSchema.extend({ question: z.string().trim().min(3, "Write your question for the agent.").max(500, "Keep it under 500 characters.") });

/** Admin: ask the agent a question before deciding. */
export async function askAgent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(ADMINS, async () => {
    const parsed = questionForm.safeParse(rawForm(formData));
    if (!parsed.success) {
      if (parsed.error.issues.some((i) => i.path[0] === "depositId")) throw new DepositError(REFRESH);
      return fieldErrors(parsed.error);
    }
    await rpc("ask_agent_about_deposit", { p_deposit_id: parsed.data.depositId, p_question: parsed.data.question });
    refresh();
    return { ok: true, message: "Sent. The agent has been asked." };
  });
}
