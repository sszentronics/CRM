import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicSupabaseEnv } from "./env";

/**
 * Service-role client. Bypasses row-level security, so it is only for work no
 * user session can do: creating auth users, ending sessions, writing audit rows.
 * Always check the caller's permission before using it.
 */
export function createAdminClient() {
  const { url } = publicSupabaseEnv();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY must be set on the server. See .env.example.");
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
