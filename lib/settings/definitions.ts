import { z } from "zod";

export type SettingGroup = "Calls and leads" | "Analysts" | "Deposits" | "Security" | "Lists";

type IntDef = {
  kind: "int";
  label: string;
  help: string;
  group: SettingGroup;
  unit: "hours" | "days" | "minutes" | "tries" | "rupees";
  min: number;
  max: number;
  default: number;
};

type ListDef = {
  kind: "list";
  label: string;
  help: string;
  group: SettingGroup;
  default: string[];
};

/** Every setting from BUILD.md section 6, with its limits. The database row holds the live value. */
export const SETTINGS = {
  first_call_deadline_hours: {
    kind: "int",
    label: "First call deadline",
    help: "How long an agent has to make the first call on a newly assigned lead.",
    group: "Calls and leads",
    unit: "hours",
    min: 1,
    max: 168,
    default: 24,
  },
  max_call_tries: {
    kind: "int",
    label: "Maximum call tries",
    help: "No-answer calls before a lead goes back to the Team Lead.",
    group: "Calls and leads",
    unit: "tries",
    min: 1,
    max: 20,
    default: 5,
  },
  stale_days: {
    kind: "int",
    label: "Stale after",
    help: "Days without activity before a lead is marked stale in pipelines.",
    group: "Calls and leads",
    unit: "days",
    min: 1,
    max: 90,
    default: 7,
  },
  cooling_off_days: {
    kind: "int",
    label: "Cooling-off period",
    help: "Days before a Not interested lead can go back into the pool.",
    group: "Calls and leads",
    unit: "days",
    min: 1,
    max: 365,
    default: 90,
  },
  referral_deadline_hours: {
    kind: "int",
    label: "Referral deadline",
    help: "Hours a referral may wait without a session date before the Admin is alerted.",
    group: "Analysts",
    unit: "hours",
    min: 1,
    max: 168,
    default: 24,
  },
  reversal_window_days: {
    kind: "int",
    label: "Reversal window",
    help: "Days after verification in which a reversed deposit is taken off the boards.",
    group: "Deposits",
    unit: "days",
    min: 1,
    max: 365,
    default: 30,
  },
  cash_flag_limit_pkr: {
    kind: "int",
    label: "Cash flag limit",
    help: "Cash deposits above this amount are flagged for the Admin.",
    group: "Deposits",
    unit: "rupees",
    min: 0,
    max: 100_000_000,
    default: 25_000,
  },
  idle_signout_minutes: {
    kind: "int",
    label: "Idle sign-out",
    help: "Minutes without activity before Admin and Superadmin are signed out.",
    group: "Security",
    unit: "minutes",
    min: 5,
    max: 240,
    default: 30,
  },
  lead_sources: {
    kind: "list",
    label: "Lead sources",
    help: "Choices on the add-lead form and in imports.",
    group: "Lists",
    default: ["Facebook", "Instagram", "TikTok", "PR", "Referral", "Walk-in"],
  },
  not_interested_reasons: {
    kind: "list",
    label: "Not interested reasons",
    help: "Reasons an agent picks when a lead is not interested.",
    group: "Lists",
    default: ["Not enough money", "No trust", "Already has a broker", "Not reachable", "Other"],
  },
  invalid_reasons: {
    kind: "list",
    label: "Invalid reasons",
    help: "Reasons an agent picks when marking a lead invalid.",
    group: "Lists",
    default: ["Wrong number", "Duplicate", "Fake"],
  },
} as const satisfies Record<string, IntDef | ListDef>;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = (typeof SETTINGS)[K] extends { kind: "int" } ? number : string[];

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];
export const SETTING_GROUPS: SettingGroup[] = ["Calls and leads", "Analysts", "Deposits", "Security", "Lists"];

export function isSettingKey(key: string): key is SettingKey {
  return key in SETTINGS;
}

/** Zod schema for one setting's value, with its limits and a fix-it message. */
export function settingSchema(key: SettingKey) {
  const def = SETTINGS[key];
  if (def.kind === "int") {
    const msg = `Enter a whole number from ${def.min.toLocaleString("en-US")} to ${def.max.toLocaleString("en-US")}.`;
    return z.coerce.number(msg).int(msg).min(def.min, msg).max(def.max, msg);
  }
  return z
    .array(z.string().trim().min(1, "Remove empty items.").max(60, "Keep each item under 60 characters."))
    .min(1, "Keep at least one item.")
    .max(30, "Keep the list to 30 items or fewer.")
    .refine((items) => new Set(items.map((i) => i.toLowerCase())).size === items.length, "Each item must be different.");
}

/** Parse a stored value, falling back to the default if the row is missing or malformed. */
export function parseSetting<K extends SettingKey>(key: K, raw: unknown): SettingValue<K> {
  const parsed = settingSchema(key).safeParse(raw);
  return (parsed.success ? parsed.data : SETTINGS[key].default) as SettingValue<K>;
}
