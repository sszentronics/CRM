"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { guardedAction } from "@/lib/actions";
import { friendlyDbError } from "@/lib/db-errors";
import { fieldErrors, formObject, type ActionState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { themeProblem } from "@/lib/workspace/theme";

/** A demo owner starts the default CRM. */
export async function chooseDefaultCrm(): Promise<ActionState> {
  return guardedAction(["superadmin"], async () => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("choose_default_crm");
    if (error) return { ok: false, message: friendlyDbError(error) };
    refresh();
    return { ok: true, message: "Your CRM is ready. Add your teams and leads to start." };
  });
}

const requestSchema = z.object({
  kind: z.enum(["custom_site", "default_crm", "upgrade"], "Choose what you need."),
  note: z.string().max(1000, "Keep the note under 1,000 characters.").optional(),
});

/** Asks the QuantraPro team for a custom site, the default CRM, or an upgrade. */
export async function requestHelp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = requestSchema.safeParse(formObject(formData));
  if (!parsed.success) return fieldErrors(parsed.error);
  return guardedAction(["superadmin"], async () => {
    const supabase = await createClient();
    const { error } = await supabase
      .from("workspace_requests")
      .insert({ kind: parsed.data.kind, note: parsed.data.note ?? null });
    if (error) return { ok: false, message: friendlyDbError(error) };
    refresh();
    return { ok: true, message: "Request sent. We will get back to you by email." };
  });
}

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Choose the colour with the colour picker.");
const brandingSchema = z.object({
  name: z.string().trim().min(2, "Enter your company name.").max(60, "Keep the name under 60 characters."),
  primary: hex,
  rail: hex,
});

/** Saves a client workspace's name and colours. */
export async function saveBranding(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = brandingSchema.safeParse(formObject(formData));
  if (!parsed.success) return fieldErrors(parsed.error);
  const problem = themeProblem({ primary: parsed.data.primary, rail: parsed.data.rail });
  if (problem) return { ok: false, message: problem, fieldErrors: { primary: [problem] } };
  return guardedAction(["superadmin"], async () => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("update_workspace_branding", {
      p_name: parsed.data.name,
      p_theme: { primary: parsed.data.primary, rail: parsed.data.rail },
    });
    if (error) return { ok: false, message: friendlyDbError(error) };
    refresh();
    return { ok: true, message: "Branding saved." };
  });
}

/** Back to the QuantraPro look. */
export async function resetBranding(): Promise<ActionState> {
  return guardedAction(["superadmin"], async () => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("update_workspace_branding", { p_name: "", p_theme: null });
    if (error) return { ok: false, message: friendlyDbError(error) };
    refresh();
    return { ok: true, message: "Back to the default colours." };
  });
}
