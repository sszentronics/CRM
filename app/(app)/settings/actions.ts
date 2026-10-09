"use server";

import { refresh } from "next/cache";
import { guardedAction } from "@/lib/actions";
import { logAudit } from "@/lib/audit";
import { friendlyDbError } from "@/lib/db-errors";
import type { ActionState } from "@/lib/forms";
import { isSettingKey, SETTINGS, settingSchema } from "@/lib/settings/definitions";
import { createClient } from "@/lib/supabase/server";

/** Saves one setting. Lists arrive as a JSON array in `value`; numbers as text. */
export async function updateSetting(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guardedAction(["superadmin"], async (actorId) => {
    const key = String(formData.get("key") ?? "");
    if (!isSettingKey(key)) return { ok: false, message: "That setting does not exist." };
    const def = SETTINGS[key];

    let raw: unknown = formData.get("value");
    if (def.kind === "list") {
      try {
        raw = JSON.parse(String(raw ?? "[]"));
      } catch {
        return { ok: false, message: "That list could not be read. Try again." };
      }
    } else if (typeof raw === "string") {
      raw = raw.replace(/[,\s]/g, "");
    }
    const parsed = settingSchema(key).safeParse(raw);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message, fieldErrors: { value: [parsed.error.issues[0]?.message ?? ""] } };
    }

    const supabase = await createClient();
    const { data: before } = await supabase.from("settings").select("value").eq("key", key).maybeSingle();
    if (JSON.stringify(before?.value) === JSON.stringify(parsed.data)) return { ok: true, message: "No change." };

    const { error, count } = await supabase
      .from("settings")
      .update({ value: parsed.data }, { count: "exact" })
      .eq("key", key);
    if (error || count === 0) return { ok: false, message: friendlyDbError(error) };
    await logAudit({
      actorId,
      action: "setting.update",
      entity: "setting",
      entityId: key,
      meta: { old: before?.value ?? null, new: parsed.data },
    });
    refresh();
    return { ok: true, message: `${def.label} saved.` };
  });
}
