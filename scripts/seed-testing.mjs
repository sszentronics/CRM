// Fills a LOCAL database with a clean team set for hands-on testing. No leads, no deposits.
//
//   pnpm seed:testing        (run `pnpm db:reset` first to wipe the old data)
//
// Creates: Owner (Superadmin), Admin, 1 Analyst, 2 test brokers, and Teams A, B, C, D.
// Each team has 5 members: X1 is the Team Lead, X2 to X5 are agents (A1..A5, B1..B5, ...).
// Everyone signs in with the same test password (TEST_PASSWORD, or the default below).
// Refuses to run against anything but a local database.
import { existsSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}
const host = new URL(url).hostname;
if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) {
  console.error(`Refusing to seed test data into ${host}. This script is for a local database only.`);
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const DOMAIN = "tl.test";
const password = process.env.TEST_PASSWORD || "TLtest@2026";

const { data: already } = await db.from("profiles").select("id").eq("email", `owner@${DOMAIN}`).maybeSingle();
if (already) {
  console.log("Test data is already seeded. Run `pnpm db:reset` first for a clean start.");
  process.exit(0);
}

const check = (label, { error }) => {
  if (error) {
    console.error(`Could not ${label}: ${error.message}`);
    process.exit(1);
  }
};

const rows = [];
async function person(email, name, role, teamId = null, label = role) {
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  check(`create ${email}`, { error });
  check(`create the profile for ${email}`, await db.from("profiles").insert({ id: data.user.id, full_name: name, email, role, team_id: teamId }));
  rows.push({ name, email, label });
  return { id: data.user.id };
}

await person(`owner@${DOMAIN}`, "Owner", "superadmin", null, "Owner (Superadmin)");
await person(`admin@${DOMAIN}`, "Admin", "admin", null, "Admin");

const TEAMS = [
  ["A", "cyan"],
  ["B", "coral"],
  ["C", "pink"],
  ["D", "lemon"],
];
const MEMBERS = 5;
for (const [letter, color] of TEAMS) {
  const lower = letter.toLowerCase();
  const lead = await person(`${lower}1@${DOMAIN}`, `${letter}1`, "team_lead", null, `Team ${letter} - Team Lead`);
  const { data: team, error } = await db
    .from("teams")
    .insert({ name: `Team ${letter}`, color, team_lead_id: lead.id })
    .select("id")
    .single();
  check(`create Team ${letter}`, { error });
  await db.from("profiles").update({ team_id: team.id }).eq("id", lead.id);
  for (let n = 2; n <= MEMBERS; n++) {
    await person(`${lower}${n}@${DOMAIN}`, `${letter}${n}`, "agent", team.id, `Team ${letter} - Agent`);
  }
}

await person(`analyst@${DOMAIN}`, "Analyst", "analyst", null, "Technical Analyst");

const CHECKLIST = ["cnic_front", "cnic_back", "photo", "signature", "proof_of_income", "bank_proof"];
for (const [name, market] of [["Test Broker (PSX)", "psx"], ["Test Broker (PMEX)", "pmex"]]) {
  check(`create broker ${name}`, await db.from("brokers").insert({ name, market, kyc_checklist: CHECKLIST }));
}

const width = Math.max(...rows.map((r) => r.email.length));
writeFileSync(
  ".seed-credentials.local",
  `Test sign-ins. Local only. Everyone uses the same password.\npassword: ${password}\n\n` +
    rows.map((r) => `${r.email.padEnd(width)}  ${r.name.padEnd(8)}  ${r.label}`).join("\n") +
    `\n\nThe Owner and the Admin set up an authenticator code on first sign-in.\n`,
);
console.log(`Test data seeded: ${rows.length} people, ${TEAMS.length} teams, 2 brokers, 0 leads.`);
console.log("Sign-in details are in .seed-credentials.local.");
