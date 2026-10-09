// Fills a LOCAL database with a demo company, so every screen has something to show.
//
//   pnpm seed:demo
//
// Creates 1 Superadmin, 1 Admin, 4 teams (Falcons, Markhors, Shaheens, Leopards) each with a Team Lead and 2 agents,
// 2 analysts, 2 brokers, 200 leads spread across every stage, and about a month of deposits.
//
// Safety: it refuses to run against anything but a local database (127.0.0.1 or localhost), and it does nothing if
// the demo has already been seeded. The demo password comes from SEED_PASSWORD, or is generated and written to
// .seed-credentials.local (git-ignored). It is never printed.
import { randomBytes } from "node:crypto";
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
  console.error(`Refusing to seed demo data into ${host}. This script is for a local database only.`);
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const DOMAIN = "demo.tradinglabs.test";
const password = process.env.SEED_PASSWORD || randomBytes(12).toString("base64url");
if (password.length < 10) {
  console.error("SEED_PASSWORD must be at least 10 characters.");
  process.exit(1);
}

const { data: already } = await db.from("profiles").select("id").eq("email", `owner@${DOMAIN}`).maybeSingle();
if (already) {
  console.log("The demo is already seeded. Nothing to do. Run `pnpm db:reset` first for a clean start.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Small helpers. A fixed seed makes the demo the same every time.
// ---------------------------------------------------------------------------
let state = 20261008;
const rnd = () => ((state = (state * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString();
const hoursAhead = (h) => new Date(Date.now() + h * 3_600_000).toISOString();
const check = (label, { error }) => {
  if (error) {
    console.error(`Could not ${label}: ${error.message}`);
    process.exit(1);
  }
};

async function person(email, name, role, teamId = null) {
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  check(`create ${email}`, { error });
  const { error: pErr } = await db.from("profiles").insert({ id: data.user.id, full_name: name, email, role, team_id: teamId });
  check(`create the profile for ${email}`, { error: pErr });
  return { id: data.user.id, email, name };
}

// ---------------------------------------------------------------------------
// People, teams, brokers, targets
// ---------------------------------------------------------------------------
const owner = await person(`owner@${DOMAIN}`, "Sara Owner", "superadmin");
const admin = await person(`admin@${DOMAIN}`, "Arif Admin", "admin");

const TEAMS = [
  { name: "Falcons", color: "cyan", lead: "Ayesha Khan", agents: ["Bilal Raza", "Hira Malik"], target: 3_000_000, prize: "Team dinner" },
  { name: "Markhors", color: "coral", lead: "Hamza Siddiqui", agents: ["Sana Tariq", "Usman Ali"], target: 2_500_000, prize: "Day trip to Murree" },
  { name: "Shaheens", color: "pink", lead: "Nadia Qureshi", agents: ["Zara Noor", "Imran Shah"], target: 2_000_000, prize: "Team lunch" },
  { name: "Leopards", color: "lemon", lead: "Faisal Mehmood", agents: ["Maryam Javed", "Kamran Butt"], target: 1_500_000, prize: "Cinema night" },
];
const month = new Date().toISOString().slice(0, 7) + "-01";
const teams = [];
for (const [i, t] of TEAMS.entries()) {
  const slug = t.name.toLowerCase();
  const lead = await person(`${slug}.lead@${DOMAIN}`, t.lead, "team_lead");
  const { data: team, error } = await db.from("teams").insert({ name: t.name, color: t.color, team_lead_id: lead.id }).select("id").single();
  check(`create team ${t.name}`, { error });
  await db.from("profiles").update({ team_id: team.id }).eq("id", lead.id);
  const agents = [];
  for (const [j, name] of t.agents.entries()) agents.push(await person(`${slug}.agent${j + 1}@${DOMAIN}`, name, "agent", team.id));
  check("set a target", await db.from("targets").insert({ team_id: team.id, month, amount_pkr: t.target }));
  check("set a prize", await db.from("team_prizes").insert({ team_id: team.id, month, prize: t.prize, set_by: admin.id }));
  teams.push({ id: team.id, index: i, lead, agents });
}
const analysts = [await person(`omar.analyst@${DOMAIN}`, "Omar Farooq", "analyst"), await person(`rabia.analyst@${DOMAIN}`, "Rabia Anwar", "analyst")];

const CHECKLIST = ["cnic_front", "cnic_back", "photo", "signature", "proof_of_income", "bank_proof"];
const brokers = [];
for (const [name, market] of [["Demo Securities (PSX)", "psx"], ["Demo Commodities (PMEX)", "pmex"]]) {
  const { data, error } = await db.from("brokers").insert({ name, market, kyc_checklist: CHECKLIST }).select("id").single();
  check(`create broker ${name}`, { error });
  brokers.push(data.id);
}

// ---------------------------------------------------------------------------
// 200 leads across every stage
// ---------------------------------------------------------------------------
const FIRST = ["Ahmed", "Ali", "Asad", "Aisha", "Bushra", "Danish", "Fahad", "Farah", "Ghazala", "Hassan", "Iqra", "Junaid", "Khalid", "Lubna", "Mehwish", "Naveed", "Omer", "Qasim", "Rida", "Saad", "Tahir", "Uzma", "Waqar", "Yasir", "Zainab"];
const LAST = ["Abbasi", "Baig", "Chaudhry", "Dar", "Farooqi", "Gillani", "Hashmi", "Iqbal", "Jamil", "Khattak", "Lodhi", "Mirza", "Niazi", "Orakzai", "Piracha", "Rana", "Sheikh", "Tanveer", "Usmani", "Virk"];
const SOURCES = ["Facebook", "Instagram", "TikTok", "PR", "Referral"];
const CITIES = ["Islamabad", "Rawalpindi", "Lahore", "Karachi", "Peshawar", "Faisalabad"];

const PLAN = [
  ["new", 25], ["assigned", 20], ["no_answer", 15], ["follow_up", 20], ["interested", 20], ["with_analyst", 6], ["post_session", 6],
  ["documents_pending", 14], ["deposit_recorded", 8], ["deposit_verified", 30], ["not_interested", 25], ["invalid", 11],
];
const NEEDS_FOLLOW_UP = new Set(["no_answer", "follow_up", "interested", "with_analyst", "post_session", "documents_pending"]);

const leadRows = [];
const phones = new Set();
let teamTurn = 0;
for (const [stage, count] of PLAN) {
  for (let i = 0; i < count; i++) {
    let phone;
    do phone = `+92345${String(between(1_000_000, 9_999_999))}`;
    while (phones.has(phone));
    phones.add(phone);
    const team = stage === "new" ? null : teams[teamTurn++ % teams.length];
    const agent = team ? team.agents[between(0, team.agents.length - 1)] : null;
    const createdHoursAgo = between(6, 24 * 30);
    leadRows.push({
      full_name: `${pick(FIRST)} ${pick(LAST)}`,
      phone,
      city: pick(CITIES),
      source: pick(SOURCES),
      campaign: `Demo-${pick(["Autumn", "PR-Push", "Reels"])}`,
      stage,
      team_id: team?.id ?? null,
      agent_id: agent?.id ?? null,
      next_follow_up_at: NEEDS_FOLLOW_UP.has(stage) ? (rnd() < 0.25 ? hoursAgo(between(1, 30)) : hoursAhead(between(2, 72))) : null,
      agent_assigned_at: agent ? hoursAgo(Math.max(createdHoursAgo - 4, 2)) : null,
      last_activity_at: team ? hoursAgo(between(1, Math.min(createdHoursAgo, 120))) : null,
      close_reason: stage === "not_interested" ? pick(["Not interested right now", "Already invests elsewhere"]) : stage === "invalid" ? pick(["Wrong number", "Number not in use"]) : null,
      invalid_confirmed_by: stage === "invalid" && rnd() < 0.6 ? team?.lead.id : null,
      no_answer_count: stage === "no_answer" ? between(1, 2) : 0,
      created_by: owner.id,
      created_at: hoursAgo(createdHoursAgo),
      _agent: agent,
      _team: team,
    });
  }
}
const insertable = leadRows.map((row) => {
  const copy = { ...row };
  delete copy._agent;
  delete copy._team;
  return copy;
});
const { data: leads, error: leadErr } = await db.from("leads").insert(insertable).select("id, stage, team_id, agent_id, phone");
check("insert leads", { error: leadErr });
const byPhone = new Map(leadRows.map((r) => [r.phone, r]));
const lead = (row) => ({ ...row, _agent: byPhone.get(row.phone)._agent, _team: byPhone.get(row.phone)._team });
const all = leads.map(lead);

// Calls, follow-ups, sessions
const activities = [];
const followUps = [];
for (const l of all) {
  if (!l._agent) continue;
  for (let n = between(1, 3); n > 0; n--) {
    activities.push({ lead_id: l.id, user_id: l._agent.id, type: "call", outcome: pick(["no_answer", "follow_up", "interested"]), created_at: hoursAgo(between(1, 24 * 6)) });
  }
}
for (const [i, row] of leadRows.entries()) {
  if (row.next_follow_up_at) followUps.push({ lead_id: leads[i].id, agent_id: row.agent_id, due_at: row.next_follow_up_at, status: "open" });
}
check("insert calls", await db.from("activities").insert(activities));
check("insert follow-ups", await db.from("follow_ups").insert(followUps));

const analystFor = (n) => analysts[n % analysts.length];
const sessions = [];
const credited = new Map();
let sessionTurn = 0;
for (const l of all) {
  if (l.stage === "with_analyst") {
    const a = analystFor(sessionTurn++);
    sessions.push({ lead_id: l.id, analyst_id: a.id, referred_by: l._agent.id, referral_note: "Wants to understand PSX basics.", accepted_at: hoursAgo(20), scheduled_at: hoursAhead(between(4, 48)), mode: "video" });
  } else if (l.stage === "post_session" || (l.stage === "deposit_verified" && rnd() < 0.45)) {
    const a = analystFor(sessionTurn++);
    credited.set(l.id, a.id);
    sessions.push({
      lead_id: l.id, analyst_id: a.id, referred_by: l._agent.id, referral_note: "Wants a walk-through before opening an account.",
      accepted_at: hoursAgo(200), scheduled_at: hoursAgo(between(40, 190)), mode: pick(["office", "video", "phone"]), outcome: "attended",
      client_level: pick(["beginner", "some_experience"]), interest_level: pick(["medium", "high"]), notes: "Explained the basics and the risks. Ready to proceed.",
      next_step: "Open an account", handed_back_at: hoursAgo(between(30, 180)),
    });
  }
}
check("insert sessions", await db.from("sessions").insert(sessions));
for (const [leadId, analystId] of credited) check("credit an analyst", await db.from("leads").update({ credited_analyst_id: analystId }).eq("id", leadId));

// KYC: complete and approved once a deposit is recorded; partly done while documents are pending.
let cnicBase = 3_520_200_000_000;
const withKyc = all.filter((l) => ["documents_pending", "deposit_recorded", "deposit_verified"].includes(l.stage));
for (const [i, l] of withKyc.entries()) {
  const done = l.stage !== "documents_pending";
  const { data: profile, error } = await db
    .from("kyc_profiles")
    .insert({
      lead_id: l.id,
      broker_id: brokers[i % brokers.length],
      checklist: CHECKLIST,
      cnic_number: String(cnicBase + i * 7919),
      cnic_expiry: done ? "2031-06-30" : null,
      mother_name: done ? "Demo Mother" : null,
      email: done ? `client${i}@example.com` : null,
      bank_name: done ? pick(["Meezan Bank", "HBL", "UBL"]) : null,
      iban: done ? `PK36SCBL000000${String(1_000_000_000 + i * 31).slice(0, 10)}` : null,
      income_band: done ? pick(["50k_150k", "150k_500k"]) : null,
      sim_in_own_name: done ? true : null,
      consent_at: done ? hoursAgo(300) : null,
      risk_level: done ? "low" : null,
      is_pep: done ? false : null,
    })
    .select("id")
    .single();
  check("insert KYC", { error });
  const docs = (done ? CHECKLIST : CHECKLIST.slice(0, between(1, 4))).map((type) => ({
    kyc_profile_id: profile.id,
    type,
    status: done ? "approved" : "collected",
    collected_by: l._agent?.id,
    reviewed_by: done ? admin.id : null,
    reviewed_at: done ? hoursAgo(120) : null,
  }));
  check("insert documents", await db.from("documents").insert(docs));
}

// ---------------------------------------------------------------------------
// A month of deposits: verified (with feed rows), pending, and a few rejected or reversed
// ---------------------------------------------------------------------------
const kycOf = new Map(
  (await db.from("kyc_profiles").select("lead_id, broker_id").in("lead_id", withKyc.map((l) => l.id))).data.map((k) => [k.lead_id, k.broker_id]),
);
const round5k = (n) => Math.round(n / 5000) * 5000;
let ref = 100000;
const deposits = [];
const dep = (l, over) => ({
  lead_id: l.id, broker_id: kycOf.get(l.id), type: "first", agent_id: l.agent_id, team_id: l.team_id, credited_analyst_id: credited.get(l.id) ?? null,
  amount_pkr: round5k(between(25_000, 600_000)), deposit_date: new Date().toISOString().slice(0, 10), method: pick(["bank_transfer", "bank_transfer", "online", "cash"]),
  reference_no: `DEMO-TXN-${ref++}`, created_by: l.agent_id, ...over,
});
for (const l of all.filter((x) => x.stage === "deposit_verified")) {
  const ago = between(8, 24 * 28);
  deposits.push(dep(l, { status: "verified", verified_by: admin.id, verified_at: hoursAgo(ago), created_at: hoursAgo(ago + 3), deposit_date: hoursAgo(ago + 4).slice(0, 10) }));
  if (rnd() < 0.3) {
    const later = Math.max(ago - between(6, 120), 2);
    deposits.push(dep(l, { type: "top_up", status: "verified", verified_by: admin.id, verified_at: hoursAgo(later), created_at: hoursAgo(later + 2), amount_pkr: round5k(between(10_000, 200_000)) }));
  }
}
for (const l of all.filter((x) => x.stage === "deposit_recorded")) {
  deposits.push(dep(l, { status: "pending", created_at: hoursAgo(between(1, 30)) }));
}
const fundedLeads = all.filter((x) => x.stage === "deposit_verified");
for (const l of fundedLeads.slice(0, 2)) {
  deposits.push(dep(l, { type: "top_up", status: "rejected", rejected_by: admin.id, rejected_at: hoursAgo(50), reject_reason: "Reference did not match the statement", created_at: hoursAgo(60) }));
}
for (const l of fundedLeads.slice(2, 4)) {
  deposits.push(dep(l, { type: "top_up", status: "reversed", verified_by: admin.id, verified_at: hoursAgo(300), reversed_by: admin.id, reversed_at: hoursAgo(200), reverse_reason: "Client withdrew the money", created_at: hoursAgo(304) }));
}
check("insert deposits", await db.from("deposits").insert(deposits));
const newest = deposits.filter((d) => d.status === "verified").sort((a, b) => (a.verified_at < b.verified_at ? 1 : -1)).slice(0, 15);
check("insert feed rows", await db.from("feed_events").insert(newest.map((d) => ({ kind: "deposit_verified", team_id: d.team_id, agent_id: d.agent_id, amount_pkr: d.amount_pkr, created_at: d.verified_at }))));

// Hand the demo password to whoever ran this, without printing it.
const people = [owner, admin, ...teams.flatMap((t) => [t.lead, ...t.agents]), ...analysts];
writeFileSync(
  ".seed-credentials.local",
  `Demo sign-ins. Local only. Everyone uses the same password.\npassword: ${password}\n\n${people.map((p) => p.email).join("\n")}\n\nThe Owner and the Admin set up an authenticator code on first sign-in.\n`,
);
const verified = deposits.filter((d) => d.status === "verified");
console.log(
  `Demo seeded: ${people.length} people, ${teams.length} teams, ${all.length} leads, ${verified.length} verified deposits ` +
    `(Rs ${verified.reduce((s, d) => s + d.amount_pkr, 0).toLocaleString("en-US")}).`,
);
console.log("Sign-in details are in .seed-credentials.local.");
