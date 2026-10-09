import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { returnOpenLeads } from "@/lib/leads/assign";

/**
 * Runs after a user is disabled, as the Admin or Superadmin who disabled them.
 * Their open leads return to their Team Lead's unassigned list (BUILD.md Module 4).
 */
export async function onUserDisabled(supabase: SupabaseClient, userId: string): Promise<number> {
  return returnOpenLeads(supabase, userId, "Person disabled");
}
