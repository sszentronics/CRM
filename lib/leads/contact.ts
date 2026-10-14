import { fromKarachi, karachiParts } from "@/lib/format/dates";

export const TEMPERATURES = ["hot", "warm", "cold"] as const;
export type Temperature = (typeof TEMPERATURES)[number];
export const TEMPERATURE_LABEL: Record<Temperature, string> = { hot: "Hot", warm: "Warm", cold: "Cold" };

export const CONTACT_CHANNELS = ["call", "whatsapp", "message", "email"] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];
export const CHANNEL_LABEL: Record<ContactChannel, string> = {
  call: "Call",
  whatsapp: "WhatsApp",
  message: "Message",
  email: "Email",
};
/** Channels that can be logged without a call outcome. */
export const LOGGABLE_CHANNELS = ["whatsapp", "message", "email"] as const;

export const isTemperature = (v: unknown): v is Temperature => TEMPERATURES.includes(v as Temperature);
export const isChannel = (v: unknown): v is ContactChannel => CONTACT_CHANNELS.includes(v as ContactChannel);

/** Colour bands for "days since the last contact". Calendar days in Karachi time. */
export const FRESHNESS = ["green", "yellow", "red", "never"] as const;
export type Freshness = (typeof FRESHNESS)[number];
export const FRESHNESS_LABEL: Record<Freshness, string> = {
  green: "0 to 3 days",
  yellow: "4 to 7 days",
  red: "8 days or more",
  never: "Never contacted",
};

/** The Karachi calendar day number of an instant, so two instants a day apart always differ by 1. */
function dayNumber(at: Date): number {
  const p = karachiParts(at);
  return Math.floor(Date.UTC(p.year, p.month, p.day) / 86_400_000);
}

/** Whole calendar days since the last contact (0 = today). */
export function daysSince(lastContactedAt: string | Date, now: Date = new Date()): number {
  const at = typeof lastContactedAt === "string" ? new Date(lastContactedAt) : lastContactedAt;
  return Math.max(0, dayNumber(now) - dayNumber(at));
}

/** 0 to 3 days is green, 4 to 7 yellow, 8 or more red. A lead nobody has contacted is "never". */
export function contactFreshness(lastContactedAt: string | Date | null, now: Date = new Date()): Freshness {
  if (!lastContactedAt) return "never";
  const days = daysSince(lastContactedAt, now);
  if (days <= 3) return "green";
  if (days <= 7) return "yellow";
  return "red";
}

/**
 * The instants that split the bands, for list filters: `green` contacts are at or after `greenFrom`,
 * `yellow` are at or after `yellowFrom` and before `greenFrom`, `red` are before `yellowFrom`.
 */
export function freshnessBounds(now: Date = new Date()) {
  const p = karachiParts(now);
  return {
    greenFrom: fromKarachi(p.year, p.month, p.day - 3).toISOString(),
    yellowFrom: fromKarachi(p.year, p.month, p.day - 7).toISOString(),
  };
}
