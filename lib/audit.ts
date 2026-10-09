import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export type AuditEntry = {
  /** Who did it. Taken from the verified session, never from the client. */
  actorId: string | null;
  /** Dotted verb, e.g. "user.create", "team.change_lead". */
  action: string;
  entity: string;
  entityId?: string | null;
  /** Context such as old and new values. Never passwords or document contents. */
  meta?: Record<string, unknown>;
};

async function requestIp(): Promise<string | null> {
  try {
    const h = await headers();
    const raw = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip");
    return raw && /^[\d.:a-fA-F]+$/.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Write one audit row. The table is append-only and has no insert policy, so
 * rows are written with the service role after the caller's permission check.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  await logAuditMany([entry]);
}

/** Several audit rows in one write, e.g. one per changed target cell. */
export async function logAuditMany(entries: AuditEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const ip = await requestIp();
  const { error } = await createAdminClient()
    .from("audit_log")
    .insert(
      entries.map((entry) => ({
        user_id: entry.actorId,
        action: entry.action,
        entity: entry.entity,
        entity_id: entry.entityId ?? null,
        meta: entry.meta ?? {},
        ip,
      })),
    );
  if (error) throw new Error(`Audit write failed: ${error.message}`);
}
