import { mkdirSync, writeFileSync } from "node:fs";
import { test as setup } from "@playwright/test";
import {
  ACCOUNTS,
  AUTH_DIR,
  E2E_PASSWORD,
  E2E_TEAM,
  SECRETS_FILE,
  anonClient,
  serviceClient,
  storageStateFor,
  type AccountKey,
} from "./helpers/accounts";
import { loginAs } from "./helpers/login";
import { freshTotp } from "./helpers/totp";

const MFA_KEYS: AccountKey[] = ["superadmin", "admin", "superadmin_login", "admin_login"];
const SESSION_KEYS: AccountKey[] = ["superadmin", "admin", "team_lead", "agent", "analyst"];

async function findUserId(email: string): Promise<string | null> {
  const admin = serviceClient();
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email === email);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

/** Creates or resets one test account so every run starts from the same state. */
async function ensureAccount(key: AccountKey, teamId: string | null): Promise<string> {
  const admin = serviceClient();
  const a = ACCOUNTS[key];
  let id = await findUserId(a.email);
  if (!id) {
    const { data, error } = await admin.auth.admin.createUser({
      email: a.email,
      password: E2E_PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) throw error ?? new Error("createUser failed");
    id = data.user.id;
  } else {
    await admin.auth.admin.updateUserById(id, { password: E2E_PASSWORD, ban_duration: "none" });
  }

  const { data: existing } = await admin.from("profiles").select("team_id").eq("id", id).maybeSingle();
  const team_id = a.role === "agent" ? teamId : a.role === "team_lead" ? (existing?.team_id ?? null) : null;
  const { error } = await admin
    .from("profiles")
    .upsert({ id, full_name: a.name, email: a.email, role: a.role, team_id, is_active: true }, { onConflict: "id" });
  if (error) throw error;
  return id;
}

async function ensureTeam(leadId: string): Promise<string> {
  const admin = serviceClient();
  const { data: team } = await admin.from("teams").select("id, team_lead_id").eq("name", E2E_TEAM).maybeSingle();
  if (team) {
    if (team.team_lead_id !== leadId) {
      const { error } = await admin.from("teams").update({ team_lead_id: leadId }).eq("id", team.id);
      if (error) throw error;
    }
    return team.id;
  }
  const { data, error } = await admin
    .from("teams")
    .insert({ name: E2E_TEAM, color: "cyan", team_lead_id: leadId })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("team insert failed");
  return data.id;
}

/** Removes old authenticators and enrols a fresh one whose secret the tests know. */
async function enrollTotp(key: AccountKey, userId: string): Promise<string> {
  const admin = serviceClient();
  const { data: factors } = await admin.auth.admin.mfa.listFactors({ userId });
  for (const f of factors?.factors ?? []) await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId });

  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email: ACCOUNTS[key].email, password: E2E_PASSWORD });
  if (signInError) throw signInError;
  const { data, error } = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: `e2e-${Date.now()}` });
  if (error || !data) throw error ?? new Error("enroll failed");
  const code = await freshTotp(data.totp.secret, ACCOUNTS[key].email);
  const { error: verifyError } = await client.auth.mfa.challengeAndVerify({ factorId: data.id, code });
  if (verifyError) throw verifyError;
  return data.totp.secret;
}

setup("prepare accounts and sessions", async ({ page }) => {
  setup.setTimeout(180_000);
  mkdirSync(AUTH_DIR, { recursive: true });

  const ids: Partial<Record<AccountKey, string>> = {};
  for (const key of ["superadmin", "admin", "analyst", "superadmin_login", "admin_login", "team_lead"] as const) {
    ids[key] = await ensureAccount(key, null);
  }
  const teamId = await ensureTeam(ids.team_lead!);
  ids.agent = await ensureAccount("agent", teamId);
  ids.disabled = await ensureAccount("disabled", teamId);

  // The disabled account: profile off and banned, exactly as the disable action leaves it.
  const admin = serviceClient();
  await admin.from("profiles").update({ is_active: false }).eq("id", ids.disabled);
  await admin.auth.admin.updateUserById(ids.disabled!, { ban_duration: "876000h" });

  const secrets: Record<string, string> = {};
  for (const key of MFA_KEYS) secrets[key] = await enrollTotp(key, ids[key]!);
  writeFileSync(SECRETS_FILE, JSON.stringify(secrets, null, 2));

  for (const key of SESSION_KEYS) {
    await page.context().clearCookies();
    await loginAs(page, key);
    await page.context().storageState({ path: storageStateFor(key) });
  }
});
