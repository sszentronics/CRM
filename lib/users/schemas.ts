import { z } from "zod";
import { ROLES } from "@/lib/auth/roles";
import { normalisePhone, PHONE_HELP } from "@/lib/format/phone";
import { TEAM_COLORS } from "@/lib/teams";

const fullName = z
  .string("Enter the person's full name.")
  .trim()
  .min(2, "Enter the person's full name.")
  .max(80, "Keep the name under 80 characters.");

/** Optional phone, normalised to E.164 (+92... or any other country). */
const phone = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const n = normalisePhone(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: PHONE_HELP });
      return z.NEVER;
    }
    return n;
  });

const role = z.enum(ROLES, "Choose a role.");
const uuid = z.uuid("Choose an option from the list.");

/** Agents need a team. Team Leads get theirs from the Teams tab. Everyone else has none. */
function teamRule<T extends { role: (typeof ROLES)[number]; teamId?: string | null }>(v: T, ctx: z.RefinementCtx) {
  if (v.role === "agent" && !v.teamId) {
    ctx.addIssue({ code: "custom", path: ["teamId"], message: "Choose the agent's team." });
  }
}

export const createUserSchema = z
  .object({
    fullName,
    email: z.email("Enter a valid email address.").transform((v) => v.toLowerCase()),
    phone,
    role,
    teamId: uuid.optional(),
  })
  .superRefine(teamRule)
  .transform((v) => ({ ...v, teamId: v.role === "agent" ? v.teamId! : null }));

export type CreateUserInput = z.output<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    id: uuid,
    fullName,
    phone,
    role,
    teamId: uuid.optional(),
  })
  .superRefine(teamRule);

export type UpdateUserInput = z.output<typeof updateUserSchema>;

export const idSchema = z.object({ id: uuid });

const teamName = z
  .string("Enter a team name.")
  .trim()
  .min(2, "A team name needs at least 2 characters.")
  .max(40, "Keep the team name under 40 characters.");
const teamColor = z.enum(TEAM_COLORS, "Choose a team colour.");

export const createTeamSchema = z.object({
  name: teamName,
  color: teamColor,
  teamLeadId: z.uuid("Choose the Team Lead."),
});

export const updateTeamSchema = z.object({
  id: uuid,
  name: teamName,
  color: teamColor,
});

export const changeLeadSchema = z.object({
  teamId: uuid,
  teamLeadId: z.uuid("Choose the new Team Lead."),
});
