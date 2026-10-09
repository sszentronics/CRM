"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { PermissionError, requireActor } from "@/lib/auth/actor";
import { ROLES } from "@/lib/auth/roles";
import { newPasswordSchema } from "@/lib/auth/schemas";
import { logAudit } from "@/lib/audit";
import { fieldErrors, formObject, type ActionState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

/** Saves the public URL of a photo the user just uploaded to their own avatars folder. */
export async function updateMyPhoto(photoUrl: string): Promise<ActionState> {
  try {
    const me = await requireActor(ROLES);
    const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${me.id}/`;
    const parsed = z.url().safeParse(photoUrl);
    if (!parsed.success || !photoUrl.startsWith(base)) return { ok: false, message: "That photo could not be saved. Upload it again." };

    const supabase = await createClient();
    const { error } = await supabase.from("profiles").update({ photo_url: photoUrl }).eq("id", me.id);
    if (error) return { ok: false, message: "That photo could not be saved. Upload it again." };
    await logAudit({ actorId: me.id, action: "profile.photo_update", entity: "profile", entityId: me.id });
    refresh();
    return { ok: true, message: "Photo updated." };
  } catch (err) {
    if (err instanceof PermissionError) return { ok: false, message: err.message };
    throw err;
  }
}

export async function changeMyPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const me = await requireActor(ROLES);
    const parsed = newPasswordSchema.safeParse(formObject(formData));
    if (!parsed.success) return fieldErrors(parsed.error);
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) {
      return {
        ok: false,
        message:
          error.code === "same_password"
            ? "Choose a password you have not used before."
            : "That password was not accepted. Use at least 10 characters and try again.",
      };
    }
    await logAudit({ actorId: me.id, action: "profile.password_change", entity: "profile", entityId: me.id });
    return { ok: true, message: "Password changed. Use it next time you sign in." };
  } catch (err) {
    if (err instanceof PermissionError) return { ok: false, message: err.message };
    throw err;
  }
}
