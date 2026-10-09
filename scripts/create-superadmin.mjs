// Creates the first Superadmin. Nobody can sign up, so the first account has to come from here.
//
//   pnpm superadmin:create owner@tradinglabs.pk "Full Name"
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.
// Sends an invite email with a link to set the password. Locally, open Mailpit at
// http://127.0.0.1:54324 to see it.
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const [email, ...nameParts] = process.argv.slice(2);
const fullName = nameParts.join(" ").trim();
if (!email || !email.includes("@") || fullName.length < 2) {
  console.error('Usage: pnpm superadmin:create <email> "<full name>"');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const lower = email.toLowerCase();

const { data, error } = await admin.auth.admin.inviteUserByEmail(lower, { data: { full_name: fullName } });
if (error || !data.user) {
  console.error(`Could not create the account: ${error?.message ?? "unknown error"}`);
  process.exit(1);
}

const { error: profileError } = await admin
  .from("profiles")
  .insert({ id: data.user.id, full_name: fullName, email: lower, role: "superadmin" });
if (profileError) {
  await admin.auth.admin.deleteUser(data.user.id);
  console.error(`Could not create the profile: ${profileError.message}`);
  process.exit(1);
}

await admin.from("audit_log").insert({
  user_id: null,
  action: "user.create",
  entity: "profile",
  entity_id: data.user.id,
  meta: { email: lower, role: "superadmin", via: "create-superadmin script" },
});

console.log(`Superadmin ${fullName} <${lower}> created. Check the inbox for the set-password link.`);
