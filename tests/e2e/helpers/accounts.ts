import { scoped } from "../../../scripts/scoped-client.mjs";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Role } from "../../../lib/auth/roles";

/**
 * Local test accounts. These exist only in the local Supabase started by
 * `pnpm db:start`; the password is a test value, never a real one.
 */
export const E2E_PASSWORD = "e2e-Local-Only-Pass-2026";
export const E2E_TEAM = "E2E Falcons";

export type AccountKey =
  | "superadmin"
  | "admin"
  | "team_lead"
  | "agent"
  | "analyst"
  | "disabled"
  | "superadmin_login"
  | "admin_login";

export const ACCOUNTS: Record<AccountKey, { email: string; name: string; role: Role }> = {
  superadmin: { email: "e2e-superadmin@tradinglabs.test", name: "Sara Superadmin", role: "superadmin" },
  admin: { email: "e2e-admin@tradinglabs.test", name: "Adil Admin", role: "admin" },
  team_lead: { email: "e2e-lead@tradinglabs.test", name: "Lena Lead", role: "team_lead" },
  agent: { email: "e2e-agent@tradinglabs.test", name: "Ali Agent", role: "agent" },
  analyst: { email: "e2e-analyst@tradinglabs.test", name: "Omar Analyst", role: "analyst" },
  disabled: { email: "e2e-disabled@tradinglabs.test", name: "Dani Disabled", role: "agent" },
  // Separate accounts for tests that type a 6-digit code, so they never race the stored sessions.
  superadmin_login: { email: "e2e-superadmin-login@tradinglabs.test", name: "Sami Superadmin", role: "superadmin" },
  admin_login: { email: "e2e-admin-login@tradinglabs.test", name: "Asma Admin", role: "admin" },
};

export const AUTH_DIR = path.join("playwright", ".auth");
export const storageStateFor = (key: AccountKey) => path.join(AUTH_DIR, `${key}.json`);
const SECRETS_FILE = path.join(AUTH_DIR, "totp-secrets.json");
export { SECRETS_FILE };

export function totpSecretFor(key: AccountKey): string {
  const secrets = JSON.parse(readFileSync(SECRETS_FILE, "utf8")) as Record<string, string>;
  const s = secrets[key];
  if (!s) throw new Error(`No TOTP secret for ${key}. Did the setup project run?`);
  return s;
}

/** Reads .env.local so tests reach the same local Supabase as the app. */
export function loadEnv() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) throw new Error("Set the Supabase variables in .env.local (see README).");
  return { url, anon, service };
}

/** The service role has no signed-in workspace, so inserts are stamped with Trading Labs, where the e2e accounts live. */
export function serviceClient() {
  const { url, service } = loadEnv();
  const client = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  return scoped(client) as typeof client;
}

export function anonClient() {
  const { url, anon } = loadEnv();
  return createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
}
