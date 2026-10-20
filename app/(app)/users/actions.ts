"use server";

import { refresh } from "next/cache";
import { guardedAction } from "@/lib/actions";
import { canManageRole, type Role } from "@/lib/auth/roles";
import { logAudit } from "@/lib/audit";
import { friendlyDbError } from "@/lib/db-errors";
import { fieldErrors, formObject, type ActionState } from "@/lib/forms";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createUserCore, UserInputError } from "@/lib/users/create-user";
import { onUserDisabled } from "@/lib/users/hooks";
import {
  changeLeadSchema,
  createTeamSchema,
  createUserSchema,
  idSchema,
  updateTeamSchema,
  updateUserSchema,
} from "@/lib/users/schemas";

/** Superadmin manages everyone; Admin manages teams, Team Leads and agents (owner decision, 8 Oct 2026). */
const MANAGERS: Role[] = ["superadmin", "admin"];
const OUT_OF_SCOPE = "Only the Superadmin can manage Admins, analysts and the Superadmin.";
/** Effectively permanent. Supabase has no "forever" ban. */
const DISABLED_BAN = "876000h";

type Admin = ReturnType<typeof createAdminClient>;

/** A field error when this email or phone already belongs to someone, else null. */
async function findClash(admin: Admin, email: string, phone: string | null): Promise<ActionState> {
  const { data: byEmail } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (byEmail) return fieldClash("email", EMAIL_TAKEN);
  if (phone) {
    const { data: byPhone } = await admin.from("profiles").select("id").eq("phone", phone).maybeSingle();
    if (byPhone) return fieldClash("phone", PHONE_TAKEN);
  }
  return null;
}

const EMAIL_TAKEN = "That email already has an account.";
const PHONE_TAKEN = "That phone number already belongs to another person.";

function fieldClash(field: "email" | "phone", message: string): ActionState {
  return { ok: false, message: "Some fields need attention.", fieldErrors: { [field]: [message] } };
}

const guarded = (run: Parameters<typeof guardedAction>[1]) => guardedAction(MANAGERS, run);

export async function createUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guarded(async (actorId, actor) => {
    const parsed = createUserSchema.safeParse(formObject(formData));
    if (!parsed.success) return fieldErrors(parsed.error);
    if (!canManageRole(actor.role, parsed.data.role)) return { ok: false, message: OUT_OF_SCOPE };
    const supabase = await createClient();
    const admin = createAdminClient();

    // Check before inviting: the invite email goes out the moment the account is made,
    // so a clash found afterwards would leave an email behind for a person who was never added.
    const clash = await findClash(admin, parsed.data.email, parsed.data.phone);
    if (clash) return clash;

    await createUserCore(
      {
        async inviteUser(email, fullName) {
          const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName } });
          if (error || !data.user) {
            throw new UserInputError(
              error?.code === "email_exists" || /already/i.test(error?.message ?? "")
                ? "That email already has an account."
                : "The invite could not be sent. Check the email address and try again.",
            );
          }
          return { id: data.user.id };
        },
        async insertProfile(row) {
          const { error } = await supabase.from("profiles").insert(row);
          if (error) throw new UserInputError(friendlyDbError(error));
        },
        async removeAuthUser(id) {
          await admin.auth.admin.deleteUser(id);
        },
        audit: (entry) => logAudit(entry),
      },
      { id: actorId },
      parsed.data,
    );
    refresh();
    return { ok: true, message: `${parsed.data.fullName} added. An email is on its way to set a password.` };
  });
}

export async function updateUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guarded(async (actorId, actor) => {
    const parsed = updateUserSchema.safeParse(formObject(formData));
    if (!parsed.success) return fieldErrors(parsed.error);
    const input = parsed.data;
    const supabase = await createClient();

    const { data: before } = await supabase
      .from("profiles")
      .select("id, full_name, phone, role, team_id")
      .eq("id", input.id)
      .maybeSingle();
    if (!before) return { ok: false, message: "That person no longer exists." };
    if (!canManageRole(actor.role, before.role) || !canManageRole(actor.role, input.role)) {
      return { ok: false, message: OUT_OF_SCOPE };
    }

    // A Team Lead's team is managed from the Teams tab, so it is left as it is.
    const teamId = input.role === "agent" ? input.teamId! : input.role === "team_lead" ? before.team_id : null;
    const after = { full_name: input.fullName, phone: input.phone, role: input.role, team_id: teamId };

    if (input.phone && input.phone !== before.phone) {
      const { data: taken } = await createAdminClient().from("profiles").select("id").eq("phone", input.phone).neq("id", input.id).maybeSingle();
      if (taken) return fieldClash("phone", PHONE_TAKEN);
    }

    const { error } = await supabase.from("profiles").update(after).eq("id", input.id);
    if (error) {
      return error.code === "23505" && /phone/.test(error.message ?? "")
        ? fieldClash("phone", PHONE_TAKEN)
        : { ok: false, message: friendlyDbError(error) };
    }

    const changes = Object.fromEntries(
      Object.entries(after)
        .filter(([k, v]) => before[k as keyof typeof before] !== v)
        .map(([k, v]) => [k, { old: before[k as keyof typeof before], new: v }]),
    );
    if (Object.keys(changes).length > 0) {
      await logAudit({ actorId, action: "user.update", entity: "profile", entityId: input.id, meta: { changes } });
    }
    refresh();
    return { ok: true, message: `${input.fullName} saved.` };
  });
}

export async function setUserActive(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guarded(async (actorId, actor) => {
    const parsed = idSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, message: "Choose a person first." };
    const active = formData.get("active") === "true";
    const { id } = parsed.data;
    if (id === actorId && !active) return { ok: false, message: "You cannot disable your own account." };

    const supabase = await createClient();
    const { data: target } = await supabase.from("profiles").select("role").eq("id", id).maybeSingle<{ role: Role }>();
    if (!target) return { ok: false, message: "That person no longer exists." };
    if (!canManageRole(actor.role, target.role)) return { ok: false, message: OUT_OF_SCOPE };

    const { data: person, error } = await supabase
      .from("profiles")
      .update({ is_active: active })
      .eq("id", id)
      .select("full_name")
      .maybeSingle();
    if (error || !person) return { ok: false, message: friendlyDbError(error) };

    const admin = createAdminClient();
    let returned = 0;
    await admin.auth.admin.updateUserById(id, { ban_duration: active ? "none" : DISABLED_BAN });
    if (!active) {
      // End every session at once, then hand their open leads back to their Team Lead.
      await admin.rpc("admin_end_sessions", { target: id });
      returned = await onUserDisabled(supabase, id);
    }
    await logAudit({
      actorId,
      action: active ? "user.enable" : "user.disable",
      entity: "profile",
      entityId: id,
      meta: active ? {} : { leads_returned: returned },
    });
    refresh();
    const leadsNote = returned > 0 ? ` ${returned} open ${returned === 1 ? "lead went" : "leads went"} back to the Team Lead.` : "";
    return {
      ok: true,
      message: active ? `${person.full_name} can sign in again.` : `${person.full_name} is disabled and signed out.${leadsNote}`,
    };
  });
}

export async function sendResetForUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guarded(async (actorId, actor) => {
    const parsed = idSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, message: "Choose a person first." };
    const supabase = await createClient();
    const { data: person } = await supabase
      .from("profiles")
      .select("full_name, email, is_active, role")
      .eq("id", parsed.data.id)
      .maybeSingle<{ full_name: string; email: string; is_active: boolean; role: Role }>();
    if (!person) return { ok: false, message: "That person no longer exists." };
    if (!canManageRole(actor.role, person.role)) return { ok: false, message: OUT_OF_SCOPE };
    if (!person.is_active) return { ok: false, message: "Enable this account before resetting its password." };

    const { error } = await supabase.auth.resetPasswordForEmail(person.email);
    if (error) return { ok: false, message: "The reset email could not be sent. Try again in a minute." };
    await logAudit({ actorId, action: "user.password_reset_sent", entity: "profile", entityId: parsed.data.id });
    return { ok: true, message: `Reset link sent to ${person.email}.` };
  });
}

export async function createTeam(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guarded(async (actorId) => {
    const parsed = createTeamSchema.safeParse(formObject(formData));
    if (!parsed.success) return fieldErrors(parsed.error);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("teams")
      .insert({ name: parsed.data.name, color: parsed.data.color, team_lead_id: parsed.data.teamLeadId })
      .select("id")
      .single();
    if (error || !data) return { ok: false, message: friendlyDbError(error) };
    await logAudit({
      actorId,
      action: "team.create",
      entity: "team",
      entityId: data.id,
      meta: { name: parsed.data.name, color: parsed.data.color, team_lead_id: parsed.data.teamLeadId },
    });
    refresh();
    return { ok: true, message: `${parsed.data.name} created.` };
  });
}

export async function updateTeam(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guarded(async (actorId) => {
    const parsed = updateTeamSchema.safeParse(formObject(formData));
    if (!parsed.success) return fieldErrors(parsed.error);
    const supabase = await createClient();
    const { data: before } = await supabase.from("teams").select("name, color").eq("id", parsed.data.id).maybeSingle();
    if (!before) return { ok: false, message: "That team no longer exists." };
    const { error } = await supabase
      .from("teams")
      .update({ name: parsed.data.name, color: parsed.data.color })
      .eq("id", parsed.data.id);
    if (error) return { ok: false, message: friendlyDbError(error) };
    await logAudit({
      actorId,
      action: "team.update",
      entity: "team",
      entityId: parsed.data.id,
      meta: { old: before, new: { name: parsed.data.name, color: parsed.data.color } },
    });
    refresh();
    return { ok: true, message: `${parsed.data.name} saved.` };
  });
}

export async function changeTeamLead(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guarded(async (actorId) => {
    const parsed = changeLeadSchema.safeParse(formObject(formData));
    if (!parsed.success) return fieldErrors(parsed.error);
    const supabase = await createClient();
    const { data: before } = await supabase
      .from("teams")
      .select("name, team_lead_id")
      .eq("id", parsed.data.teamId)
      .maybeSingle();
    if (!before) return { ok: false, message: "That team no longer exists." };
    if (before.team_lead_id === parsed.data.teamLeadId) return { ok: true, message: "No change." };

    // One update: database triggers release the old lead and attach the new one.
    const { error } = await supabase
      .from("teams")
      .update({ team_lead_id: parsed.data.teamLeadId })
      .eq("id", parsed.data.teamId);
    if (error) return { ok: false, message: friendlyDbError(error) };
    await logAudit({
      actorId,
      action: "team.change_lead",
      entity: "team",
      entityId: parsed.data.teamId,
      meta: { old: before.team_lead_id, new: parsed.data.teamLeadId },
    });
    refresh();
    return { ok: true, message: `${before.name} has a new Team Lead.` };
  });
}
