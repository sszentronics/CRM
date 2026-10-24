"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { guardedAction } from "@/lib/actions";
import type { Profile } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/roles";
import { logAudit } from "@/lib/audit";
import type { ActionState } from "@/lib/forms";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/workspace/platform";

/** The QuantraPro team only. Re-checked on every call; the page hiding the buttons is not the guard. */
function platformAction(run: (actor: Profile) => Promise<ActionState>): Promise<ActionState> {
  return guardedAction(ROLES, async (_id, actor) =>
    isPlatformAdmin(actor.email) ? run(actor) : { ok: false, message: "Only the QuantraPro team can do that." },
  );
}

const idSchema = z.uuid();

/** Turns a demo into a client workspace: no end date, custom colours unlocked. */
export async function promoteWorkspace(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return platformAction(async (actor) => {
  const id = idSchema.safeParse(formData.get("workspaceId"));
  if (!id.success) return { ok: false, message: "That workspace could not be found." };
  const admin = createAdminClient();
  const { error } = await admin
    .from("workspaces")
    .update({ plan: "client", trial_ends_at: null, product: "crm" })
    .eq("id", id.data)
    .eq("plan", "trial");
  if (error) return { ok: false, message: "That change could not be saved. Try again." };
  await logAudit({ actorId: actor.id, action: "workspace.promote", entity: "workspace", entityId: id.data });
  refresh();
  return { ok: true, message: "Workspace is now a client." };
  });
}

/** Adds days to a demo, for a prospect who needs longer. */
export async function extendTrial(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return platformAction(async (actor) => {
  const id = idSchema.safeParse(formData.get("workspaceId"));
  if (!id.success) return { ok: false, message: "That workspace could not be found." };
  const admin = createAdminClient();
  const { data: ws } = await admin.from("workspaces").select("trial_ends_at, plan").eq("id", id.data).maybeSingle();
  if (!ws || ws.plan !== "trial") return { ok: false, message: "Only demo workspaces can be extended." };
  const base = Math.max(Date.now(), new Date(ws.trial_ends_at as string).getTime());
  const { error } = await admin
    .from("workspaces")
    .update({ trial_ends_at: new Date(base + 7 * 86_400_000).toISOString() })
    .eq("id", id.data);
  if (error) return { ok: false, message: "That change could not be saved. Try again." };
  await logAudit({ actorId: actor.id, action: "workspace.extend_trial", entity: "workspace", entityId: id.data, meta: { days: 7 } });
  refresh();
  return { ok: true, message: "Demo extended by 7 days." };
  });
}

const statusSchema = z.object({ requestId: z.uuid(), status: z.enum(["new", "in_progress", "done"]) });

export async function setRequestStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return platformAction(async () => {
  const parsed = statusSchema.safeParse({ requestId: formData.get("requestId"), status: formData.get("status") });
  if (!parsed.success) return { ok: false, message: "That request could not be found." };
  const { error } = await createAdminClient()
    .from("workspace_requests")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.requestId);
  if (error) return { ok: false, message: "That change could not be saved. Try again." };
  refresh();
  return { ok: true, message: "Request updated." };
  });
}
