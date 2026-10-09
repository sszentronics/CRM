"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { guardedAction } from "@/lib/actions";
import { logAudit } from "@/lib/audit";
import { brokerSchema } from "@/lib/brokers/schemas";
import { friendlyDbError } from "@/lib/db-errors";
import { fieldErrors, formObject, type ActionState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export async function saveBroker(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guardedAction(["superadmin"], async (actorId) => {
    const parsed = brokerSchema.safeParse({ ...formObject(formData), checklist: formData.getAll("checklist") });
    if (!parsed.success) return fieldErrors(parsed.error);
    const { id, name, market, checklist } = parsed.data;
    const row = { name, market, kyc_checklist: checklist };
    const supabase = await createClient();

    if (!id) {
      const { data, error } = await supabase.from("brokers").insert(row).select("id").single();
      if (error || !data) return { ok: false, message: friendlyDbError(error) };
      await logAudit({ actorId, action: "broker.create", entity: "broker", entityId: data.id, meta: { new: row } });
      refresh();
      return { ok: true, message: `${name} added.` };
    }

    const { data: before } = await supabase
      .from("brokers")
      .select("name, market, kyc_checklist")
      .eq("id", id)
      .maybeSingle();
    if (!before) return { ok: false, message: "That broker no longer exists." };
    const { error } = await supabase.from("brokers").update(row).eq("id", id);
    if (error) return { ok: false, message: friendlyDbError(error) };
    await logAudit({ actorId, action: "broker.update", entity: "broker", entityId: id, meta: { old: before, new: row } });
    refresh();
    return { ok: true, message: `${name} saved. Checklist changes apply to new clients only.` };
  });
}

const toggleSchema = z.object({ id: z.uuid(), active: z.enum(["true", "false"]) });

/** Brokers are switched off, never removed: clients may already hold accounts with them. */
export async function setBrokerActive(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guardedAction(["superadmin"], async (actorId) => {
    const parsed = toggleSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, message: "Choose a broker first." };
    const active = parsed.data.active === "true";
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("brokers")
      .update({ is_active: active })
      .eq("id", parsed.data.id)
      .select("name")
      .maybeSingle();
    if (error || !data) return { ok: false, message: friendlyDbError(error) };
    await logAudit({
      actorId,
      action: active ? "broker.enable" : "broker.disable",
      entity: "broker",
      entityId: parsed.data.id,
      meta: { old: { is_active: !active }, new: { is_active: active } },
    });
    refresh();
    return {
      ok: true,
      message: active ? `${data.name} is on. Agents can choose it again.` : `${data.name} is off. Existing clients keep it.`,
    };
  });
}
