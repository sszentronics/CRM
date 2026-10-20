import { normalisePhone, PHONE_HELP } from "@/lib/format/phone";

/** A lead as typed in the form or read from one row of an import file. */
export type RawLead = {
  full_name?: string;
  phone?: string;
  source?: string;
  city?: string;
  campaign?: string;
  notes?: string;
};

/** A lead that passed validation, ready to insert. */
export type CleanLead = {
  full_name: string;
  phone: string;
  source: string;
  city: string | null;
  campaign: string | null;
  notes: string | null;
};

export type LeadField = keyof RawLead;

const trimmed = (v: string | undefined) => (v ?? "").replace(/\s+/g, " ").trim();
const optional = (v: string | undefined) => trimmed(v) || null;

/**
 * Validate one lead against the rules in BUILD.md Module 3. `sources` is the
 * lead_sources setting; the stored source uses the setting's spelling.
 */
export function validateLead(
  raw: RawLead,
  sources: readonly string[],
): { ok: true; lead: CleanLead } | { ok: false; errors: Partial<Record<LeadField, string>> } {
  const errors: Partial<Record<LeadField, string>> = {};

  const full_name = trimmed(raw.full_name);
  if (full_name.length < 2) errors.full_name = "Enter the lead's name.";
  else if (full_name.length > 80) errors.full_name = "Keep the name under 80 characters.";

  const phoneText = trimmed(raw.phone);
  const phone = phoneText ? normalisePhone(phoneText) : null;
  if (!phoneText) errors.phone = "Enter the lead's phone number.";
  else if (!phone) errors.phone = PHONE_HELP;

  const sourceText = trimmed(raw.source);
  const source = sources.find((s) => s.toLowerCase() === sourceText.toLowerCase());
  if (!sourceText) errors.source = "Choose where the lead came from.";
  else if (!source) errors.source = `"${sourceText}" is not a lead source. Use one of: ${sources.join(", ")}.`;

  const city = optional(raw.city);
  if (city && city.length > 60) errors.city = "Keep the city under 60 characters.";
  const campaign = optional(raw.campaign);
  if (campaign && campaign.length > 80) errors.campaign = "Keep the campaign under 80 characters.";
  const notes = (raw.notes ?? "").trim() || null;
  if (notes && notes.length > 1000) errors.notes = "Keep notes under 1,000 characters.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, lead: { full_name, phone: phone!, source: source!, city, campaign, notes } };
}

export const DUPLICATE_MESSAGE = "That number is already in the system.";
