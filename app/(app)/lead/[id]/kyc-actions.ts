"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { PermissionError, requireActor } from "@/lib/auth/actor";
import type { Role } from "@/lib/auth/roles";
import { logAudit } from "@/lib/audit";
import { dateToKarachiInput } from "@/lib/format/dates";
import { fieldErrors, formObject, type ActionState } from "@/lib/forms";
import { KYC_FIELD_LABELS, kycFormSchema, type KycField } from "@/lib/kyc/fields";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspace } from "@/lib/workspace/get";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OWNERS: Role[] = ["superadmin", "admin", "team_lead", "agent"];
const ADMINS: Role[] = ["superadmin", "admin"];

class KycError extends Error {}

async function run(roles: readonly Role[], fn: (actorId: string) => Promise<ActionState>): Promise<ActionState> {
  try {
    const actor = await requireActor(roles);
    return await fn(actor.id);
  } catch (err) {
    if (err instanceof PermissionError || err instanceof KycError) return { ok: false, message: err.message };
    throw err;
  }
}

async function rpc(name: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new KycError(error.code === "P0001" || error.code === "42501" ? error.message : "That could not be saved. Try again.");
  return data;
}

function uuid(fd: FormData, key: string) {
  const v = String(fd.get(key) ?? "");
  if (!UUID.test(v)) throw new KycError("Refresh the page and try again.");
  return v;
}

/** Choose (or change) the client's broker. The broker's checklist is copied onto this client. */
export async function chooseBroker(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(OWNERS, async (actorId) => {
    const leadId = uuid(formData, "leadId");
    const brokerId = uuid(formData, "brokerId");
    const supabase = await createClient();
    const [{ data: broker }, { data: profile }] = await Promise.all([
      supabase.from("brokers").select("id, name, kyc_checklist, is_active").eq("id", brokerId).maybeSingle(),
      supabase.from("kyc_profiles").select("id, broker_id").eq("lead_id", leadId).maybeSingle(),
    ]);
    if (!broker?.is_active) throw new KycError("Choose an active broker.");
    if (profile?.broker_id === brokerId) return { ok: true, message: "No change." };

    const { error } = profile
      ? await supabase.from("kyc_profiles").update({ broker_id: brokerId, checklist: broker.kyc_checklist }).eq("id", profile.id)
      : await supabase.from("kyc_profiles").insert({ lead_id: leadId, broker_id: brokerId, checklist: broker.kyc_checklist });
    if (error) {
      throw new KycError(error.code === "P0001" || error.code === "42501" ? error.message : "The broker could not be saved. Try again.");
    }
    await logAudit({ actorId, action: profile ? "kyc.change_broker" : "kyc.start", entity: "lead", entityId: leadId, meta: { broker_id: brokerId } });
    refresh();
    return { ok: true, message: `${broker.name} chosen. Its checklist is below.` };
  });
}

/** Save the typed KYC details. Fields may be saved part-filled; anything entered must be valid. */
export async function saveKycFields(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(OWNERS, async (actorId) => {
    const profileId = uuid(formData, "profileId");
    const today = dateToKarachiInput(new Date()).slice(0, 10);
    const parsed = kycFormSchema(today).safeParse(formObject(formData));
    if (!parsed.success) return fieldErrors(parsed.error);
    const v = parsed.data;

    const supabase = await createClient();
    const { data: before } = await supabase.from("kyc_profiles").select("*").eq("id", profileId).maybeSingle();
    if (!before) throw new KycError("This lead belongs to another team.");

    // CNIC numbers are unique across every client in the workspace.
    if (v.cnic_number) {
      const workspace = await getWorkspace();
      const { data: owner } = await createAdminClient().rpc("lead_with_cnic", { p_workspace: workspace?.id, p_cnic: v.cnic_number });
      if (owner && owner !== before.lead_id) {
        const m = "This CNIC already belongs to another client in the system.";
        return { ok: false, message: m, fieldErrors: { cnic_number: [m] } };
      }
    }

    const next = {
      cnic_number: v.cnic_number,
      cnic_expiry: v.cnic_expiry,
      mother_name: v.mother_name,
      email: v.email,
      bank_name: v.bank_name,
      iban: v.iban,
      income_band: v.income_band,
      sim_in_own_name: v.sim_in_own_name,
      consent_at: v.consent ? (before.consent_at ?? new Date().toISOString()) : null,
      risk_level: v.risk_level,
      is_pep: v.is_pep,
    };
    const { error } = await supabase.from("kyc_profiles").update(next).eq("id", profileId);
    if (error) {
      if (error.code === "23505") {
        const m = "This CNIC already belongs to another client in the system.";
        return { ok: false, message: m, fieldErrors: { cnic_number: [m] } };
      }
      throw new KycError(error.code === "42501" || error.code === "P0001" ? error.message : "The details could not be saved. Try again.");
    }
    // Audit which fields changed, never their values (CNIC and IBAN stay out of the log).
    const changed = (Object.keys(next) as KycField[]).filter((k) => String(before[k] ?? "") !== String(next[k] ?? ""));
    if (changed.length > 0) {
      await logAudit({ actorId, action: "kyc.update", entity: "kyc_profile", entityId: profileId, meta: { fields: changed } });
    }
    refresh();
    return { ok: true, message: changed.length ? `KYC details saved: ${changed.map((c) => KYC_FIELD_LABELS[c]).join(", ")}.` : "No changes." };
  });
}

const toggleSchema = z.object({ profileId: z.uuid(), type: z.string().regex(/^[a-z_]{3,40}$/), collected: z.enum(["true", "false"]) });

/** Tick (or clear) a checklist item as collected. Approved items stay locked for agents. */
export async function setCollected(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(OWNERS, async () => {
    const parsed = toggleSchema.safeParse(formObject(formData));
    if (!parsed.success) throw new KycError("Refresh the page and try again.");
    await rpc("set_document_collected", {
      p_profile_id: parsed.data.profileId,
      p_type: parsed.data.type,
      p_collected: parsed.data.collected === "true",
    });
    refresh();
    return { ok: true, message: parsed.data.collected === "true" ? "Marked collected. An Admin will check it." : "Tick cleared." };
  });
}

/** Admin: approve or reject one document. Rejecting needs a reason and notifies the agent. */
export async function reviewDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(ADMINS, async () => {
    const id = uuid(formData, "documentId");
    const approve = formData.get("decision") === "approve";
    const reason = String(formData.get("reason") ?? "").trim().slice(0, 200);
    if (!approve && !reason) {
      const m = "Give a reason so the agent knows what to fix.";
      return { ok: false, message: m, fieldErrors: { reason: [m] } };
    }
    await rpc("review_document", { p_document_id: id, p_approve: approve, p_reason: reason || null });
    refresh();
    return { ok: true, message: approve ? "Approved." : "Rejected. The agent has been told why." };
  });
}

export async function approveAll(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(ADMINS, async () => {
    const n = Number(await rpc("approve_all_documents", { p_profile_id: uuid(formData, "profileId") }));
    refresh();
    return { ok: true, message: n ? `${n} ${n === 1 ? "document" : "documents"} approved.` : "Nothing waiting to approve." };
  });
}

export async function unlockDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(ADMINS, async () => {
    await rpc("unlock_document", { p_document_id: uuid(formData, "documentId") });
    refresh();
    return { ok: true, message: "Unlocked. The agent can collect it again." };
  });
}
