type PgError = { code?: string; message?: string; details?: string } | null | undefined;

/** Messages raised by our own triggers are written for people; pass them through. */
const OWN_MESSAGES = [
  "Only the Superadmin can change name, role or team.",
  "This person leads a team. Change the Team Lead first.",
  "Choose an active Team Lead who does not lead another team.",
  "Your demo has ended. Ask for a custom site or the default CRM to continue.",
  "That belongs to another workspace.",
  "Custom colours are part of a client workspace. Ask us to upgrade you.",
  "Only the Superadmin changes branding.",
];

/** Turn a Postgres error into a sentence that says what is wrong and how to fix it. */
export function friendlyDbError(error: PgError, fallback = "That change could not be saved. Try again."): string {
  if (!error) return fallback;
  const msg = error.message ?? "";
  const own = OWN_MESSAGES.find((m) => msg.includes(m));
  if (own) return own;
  if (error.code === "23505") {
    if (msg.includes("phone")) return "That phone number already belongs to another person.";
    if (msg.includes("email")) return "That email already has an account.";
    if (msg.includes("teams_name")) return "A team with that name already exists. Choose another name.";
    if (msg.includes("brokers_name")) return "A broker with that name already exists. Edit that one instead.";
    if (msg.includes("one_lead_per_team") || msg.includes("team_lead_id")) {
      return "That team already has a Team Lead. Change the Team Lead from the Teams tab.";
    }
    return "That value is already in use.";
  }
  if (error.code === "23514" && msg.includes("profiles_team_by_role")) {
    return "Agents need a team. Admins, analysts and the Superadmin do not belong to a team.";
  }
  if (error.code === "42501") return "You do not have permission to do that.";
  return fallback;
}
