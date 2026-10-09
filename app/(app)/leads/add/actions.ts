"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { guardedAction, UserFacingError } from "@/lib/actions";
import { PermissionError, requireActor } from "@/lib/auth/actor";
import type { Role } from "@/lib/auth/roles";
import { logAudit } from "@/lib/audit";
import { normalisePhone } from "@/lib/format/phone";
import { formObject, type ActionState } from "@/lib/forms";
import {
  candidatePhones,
  classifyImportRows,
  MAX_IMPORT_ROWS,
  type ImportClassification,
  type ImportRow,
  type SkippedRow,
} from "@/lib/leads/import";
import { DUPLICATE_MESSAGE, validateLead } from "@/lib/leads/validate";
import { getSetting } from "@/lib/settings/get-setting";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const ADMINS: Role[] = ["superadmin", "admin"];

/** Which of these numbers already exist, across every lead, whoever can see it. Numbers only. */
async function existingPhones(phones: string[]): Promise<Set<string>> {
  if (phones.length === 0) return new Set();
  const out = new Set<string>();
  // Chunk so very large imports stay well under request limits.
  for (let i = 0; i < phones.length; i += 500) {
    const { data, error } = await createAdminClient().rpc("existing_lead_phones", { phones: phones.slice(i, i + 500) });
    if (error) throw new Error(`Duplicate check failed: ${error.message}`);
    for (const p of (data ?? []) as string[]) out.add(p);
  }
  return out;
}

export async function createLead(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let newId: string | null = null;
  const another = formData.get("intent") === "another";

  const result = await guardedAction(ADMINS, async (actorId) => {
    const supabase = await createClient();
    const sources = await getSetting(supabase, "lead_sources");
    const v = validateLead(formObject(formData), sources);
    if (!v.ok) {
      const fieldErrors = Object.fromEntries(Object.entries(v.errors).map(([k, m]) => [k, [m]]));
      return { ok: false, message: "Some fields need attention.", fieldErrors };
    }

    const dup = await duplicateLead(v.lead.phone);
    if (dup) return dup;

    const { data, error } = await supabase
      .from("leads")
      .insert({ ...v.lead, created_by: actorId })
      .select("id")
      .single();
    if (error?.code === "23505") return (await duplicateLead(v.lead.phone)) ?? { ok: false, message: DUPLICATE_MESSAGE };
    if (error || !data) return { ok: false, message: "The lead could not be saved. Try again." };

    await logAudit({
      actorId,
      action: "lead.create",
      entity: "lead",
      entityId: data.id,
      meta: { source: v.lead.source, via: "form" },
    });
    newId = data.id;
    return { ok: true, message: `${v.lead.full_name} saved.${another ? " Add the next one." : ""}` };
  });

  if (result?.ok && newId && !another) redirect(`/lead/${newId}`);
  if (result?.ok) refresh();
  return result;
}

/** The duplicate message, with a link target when the caller may open the existing lead. */
async function duplicateLead(phone: string): Promise<ActionState> {
  if (!(await existingPhones([phone])).has(phone)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("leads").select("id").eq("phone", phone).maybeSingle();
  return {
    ok: false,
    message: DUPLICATE_MESSAGE,
    fieldErrors: { phone: [DUPLICATE_MESSAGE] },
    data: { duplicateLeadId: data?.id ?? null },
  };
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

const rowsSchema = z
  .array(
    z.object({
      row: z.number().int().min(2),
      full_name: z.string().max(500).optional(),
      phone: z.string().max(100).optional(),
      source: z.string().max(200).optional(),
      city: z.string().max(500).optional(),
      campaign: z.string().max(500).optional(),
      notes: z.string().max(5000).optional(),
    }),
  )
  .min(1, "The file has no rows under the header.")
  .max(MAX_IMPORT_ROWS, `Import up to ${MAX_IMPORT_ROWS.toLocaleString("en-US")} rows at a time.`);

export type ImportPreview =
  | { ok: true; counts: ImportClassification["counts"]; skipped: SkippedRow[] }
  | { ok: false; message: string };

export type ImportResult =
  | { ok: true; added: number; skipped: SkippedRow[]; counts: ImportClassification["counts"] }
  | { ok: false; message: string };

async function classify(rows: unknown): Promise<ImportClassification> {
  const parsed = rowsSchema.safeParse(rows);
  if (!parsed.success) throw new UserFacingError(parsed.error.issues[0]?.message ?? "The file could not be read.");
  const list = parsed.data as ImportRow[];
  const supabase = await createClient();
  const sources = await getSetting(supabase, "lead_sources");
  const existing = await existingPhones(candidatePhones(list, normalisePhone));
  return classifyImportRows(list, existing, sources);
}

async function asAdmin<T extends { ok: boolean }>(run: (actorId: string) => Promise<T>): Promise<T | { ok: false; message: string }> {
  try {
    const actor = await requireActor(ADMINS);
    return await run(actor.id);
  } catch (err) {
    if (err instanceof PermissionError || err instanceof UserFacingError) return { ok: false, message: err.message };
    throw err;
  }
}

/** Step 3 of the import: what would happen, without writing anything. */
export async function previewImport(rows: ImportRow[]): Promise<ImportPreview> {
  return asAdmin(async () => {
    const c = await classify(rows);
    return { ok: true as const, counts: c.counts, skipped: c.skipped };
  });
}

/** Writes the new leads. Re-checks everything on the server; rows taken in the meantime become duplicates. */
export async function commitImport(rows: ImportRow[], fileName: string): Promise<ImportResult> {
  return asAdmin(async (actorId) => {
    const c = await classify(rows);
    const supabase = await createClient();
    const skipped = [...c.skipped];
    let added = 0;

    for (let i = 0; i < c.fresh.length; i += 500) {
      const chunk = c.fresh.slice(i, i + 500);
      const { data, error } = await supabase
        .from("leads")
        .upsert(
          chunk.map((r) => ({
            full_name: r.full_name,
            phone: r.phone,
            source: r.source,
            city: r.city,
            campaign: r.campaign,
            notes: r.notes,
            created_by: actorId,
          })),
          { onConflict: "phone", ignoreDuplicates: true },
        )
        .select("phone");
      if (error) throw new UserFacingError("The import stopped part way. Leads saved so far are kept. Try the rest again.");
      const saved = new Set((data ?? []).map((d) => d.phone as string));
      added += saved.size;
      // Someone added the same number while this import ran.
      for (const r of chunk) {
        if (!saved.has(r.phone)) skipped.push({ row: r.row, kind: "duplicate", reason: DUPLICATE_MESSAGE });
      }
    }

    skipped.sort((a, b) => a.row - b.row);
    const counts = {
      new: added,
      duplicate: skipped.filter((s) => s.kind === "duplicate").length,
      invalid: skipped.filter((s) => s.kind === "invalid").length,
    };
    await logAudit({
      actorId,
      action: "lead.import",
      entity: "lead",
      entityId: null,
      meta: { file: fileName.slice(0, 200), rows: rows.length, ...counts },
    });
    refresh();
    return { ok: true as const, added, skipped, counts };
  });
}
