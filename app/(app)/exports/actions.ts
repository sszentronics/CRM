"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { guardedAction } from "@/lib/actions";
import { isPeriod, periodBounds } from "@/lib/boards/periods";
import { buildCsv, EXPORT_KINDS, isExportKind } from "@/lib/exports/columns";
import { fieldErrors, type ActionState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  kind: z.string().refine(isExportKind, "Choose leads, calls or deposits."),
  period: z.string().refine(isPeriod, "Choose a period."),
  team: z.union([z.uuid(), z.literal("")]).optional(),
  sensitive: z.string().optional(),
});

/**
 * Build an export. The database checks the role, applies the row limit, and writes the history and audit rows
 * in the same call. CNIC and IBAN are refused unless the caller is the Superadmin.
 */
export async function createExport(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guardedAction(["superadmin", "admin"], async () => {
    const parsed = schema.safeParse(Object.fromEntries([...formData.entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""])));
    if (!parsed.success) return fieldErrors(parsed.error);
    const { kind, period, team, sensitive } = parsed.data;
    if (!isExportKind(kind) || !isPeriod(period)) return { ok: false, message: "Refresh the page and try again." };
    const { from, to } = periodBounds(period);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("export_data", {
      p_kind: kind,
      p_from: from.toISOString(),
      p_to: to.toISOString(),
      p_team: team || null,
      p_include_sensitive: sensitive === "on",
    });
    if (error) {
      return { ok: false, message: error.code === "P0001" || error.code === "42501" ? error.message : "The export could not be built. Try again." };
    }
    const rows = (data as { rows: Record<string, unknown>[] }).rows;
    const csv = buildCsv(kind, rows, sensitive === "on");
    refresh();
    const label = EXPORT_KINDS.find((k) => k.value === kind)!.label.toLowerCase();
    return {
      ok: true,
      message: `${rows.length} ${rows.length === 1 ? "row" : "rows"} exported.`,
      data: { csv, filename: `trading-labs-${label}-${period}.csv`, rows: rows.length },
    };
  });
}
