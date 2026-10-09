import { expect, type Page } from "@playwright/test";
import { ACCOUNTS, E2E_PASSWORD, serviceClient } from "./accounts";

export type WorldPerson = { id: string; email: string; name: string };
export type WorldTeam = { id: string; name: string; lead: WorldPerson; agents: WorldPerson[] };

const COLORS = ["cyan", "coral", "pink", "lemon", "sky", "lilac"] as const;

async function makePerson(email: string, name: string, role: "team_lead" | "agent" | "analyst", teamId: string | null): Promise<WorldPerson> {
  const db = serviceClient();
  const { data, error } = await db.auth.admin.createUser({ email, password: E2E_PASSWORD, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  const { error: pErr } = await db.from("profiles").insert({ id: data.user.id, full_name: name, email, role, team_id: teamId });
  if (pErr) throw pErr;
  return { id: data.user.id, email, name };
}

/** A team with a Team Lead and `agents` agents, all able to sign in. Unique per run. */
export async function makeTeam(run: string, label: string, agents: number, color = 0): Promise<WorldTeam> {
  const db = serviceClient();
  const slug = `${run}-${label.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
  const lead = await makePerson(`e2e-${slug}-lead@tradinglabs.test`, `Lead ${label} ${run}`, "team_lead", null);
  const name = `Team ${label} ${run}`;
  const { data: team, error } = await db
    .from("teams")
    .insert({ name, color: COLORS[color % COLORS.length], team_lead_id: lead.id })
    .select("id")
    .single();
  if (error || !team) throw error ?? new Error("team insert failed");
  const people: WorldPerson[] = [];
  for (let i = 1; i <= agents; i++) {
    people.push(await makePerson(`e2e-${slug}-agent${i}@tradinglabs.test`, `Agent ${label}${i} ${run}`, "agent", team.id));
  }
  return { id: team.id, name, lead, agents: people };
}

/** A Technical Analyst who can sign in. Unique per run. */
export async function makeAnalyst(run: string, label = "A"): Promise<WorldPerson> {
  return makePerson(`e2e-${run}-analyst${label.toLowerCase()}@tradinglabs.test`, `Analyst ${label} ${run}`, "analyst", null);
}

/** `count` pool leads tagged with the run's campaign, in a few sources. */
export async function makePoolLeads(run: string, count: number, sources = ["Facebook", "Instagram", "TikTok", "PR"]) {
  const db = serviceClient();
  const { data: creator } = await db.from("profiles").select("id").eq("email", ACCOUNTS.superadmin.email).single();
  const base = 1_000_000 + Math.floor(Math.random() * 8_000_000);
  const rows = Array.from({ length: count }, (_, i) => ({
    full_name: `Pool ${run} ${i + 1}`,
    phone: `+92346${String((base + i) % 10_000_000).padStart(7, "0")}`,
    source: sources[i % sources.length],
    campaign: `E2E-${run}`,
    created_by: creator!.id,
  }));
  const { data, error } = await db.from("leads").insert(rows).select("id, phone");
  if (error) throw error;
  return data as { id: string; phone: string }[];
}

/** Sign in as someone without the TOTP step (Team Leads, agents). */
export async function loginWith(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** An active broker with a two-item checklist, unique per run. */
export async function makeBroker(run: string, checklist = ["cnic_front", "cnic_back"]) {
  const { data, error } = await serviceClient()
    .from("brokers")
    .insert({ name: `KYC Broker ${run}`, market: "psx", kyc_checklist: checklist })
    .select("id, name")
    .single();
  if (error) throw error;
  return data as { id: string; name: string };
}
