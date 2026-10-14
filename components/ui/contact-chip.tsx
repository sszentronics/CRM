import { contactFreshness, daysSince, CHANNEL_LABEL, TEMPERATURE_LABEL, type ContactChannel, type Freshness, type Temperature } from "@/lib/leads/contact";
import { formatKarachi } from "@/lib/format/dates";
import { cn } from "@/lib/utils";

const FRESH_VAR: Record<Freshness, string> = {
  green: "--tl-fresh-green",
  yellow: "--tl-fresh-yellow",
  red: "--tl-fresh-red",
  never: "--tl-stage-idle",
};

function ago(days: number) {
  return days === 0 ? "Today" : `${days}d ago`;
}

/**
 * When and how the lead was last contacted: "2d ago · WhatsApp". The colour follows the days
 * (0 to 3 green, 4 to 7 yellow, 8 or more red) and the words say the same thing, so colour is never alone.
 */
export function ContactChip({
  lastContactedAt,
  channel,
  className,
  now,
}: {
  lastContactedAt: string | null;
  channel: ContactChannel | null;
  className?: string;
  now?: Date;
}) {
  const level = contactFreshness(lastContactedAt, now);
  const c = `var(${FRESH_VAR[level]})`;
  const text = lastContactedAt
    ? `${ago(daysSince(lastContactedAt, now))}${channel ? ` · ${CHANNEL_LABEL[channel]}` : ""}`
    : "Never contacted";
  return (
    <span
      data-freshness={level}
      title={lastContactedAt ? `Last contact ${formatKarachi(lastContactedAt)}` : "Nobody has contacted this lead yet"}
      className={cn("inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-small font-semibold whitespace-nowrap", className)}
      style={{
        color: c,
        backgroundColor: `color-mix(in srgb, ${c} 10%, white)`,
        borderColor: `color-mix(in srgb, ${c} 28%, white)`,
      }}
    >
      <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: c }} />
      {text}
    </span>
  );
}

const TEMP_VAR: Record<Temperature, string> = {
  hot: "--tl-wait",
  warm: "--tl-stage-hot",
  cold: "--tl-stage-idle",
};

/** Hot, Warm or Cold: how willing the lead is to invest, as the agent judged it. */
export function InterestChip({ temperature, className }: { temperature: Temperature | null; className?: string }) {
  if (!temperature) return <span className={cn("text-small text-tl-muted", className)}>Not set</span>;
  const c = `var(${TEMP_VAR[temperature]})`;
  return (
    <span
      data-temperature={temperature}
      className={cn("inline-flex h-6 items-center rounded-full border px-2.5 text-small font-semibold whitespace-nowrap", className)}
      style={{
        color: c,
        backgroundColor: `color-mix(in srgb, ${c} 10%, white)`,
        borderColor: `color-mix(in srgb, ${c} 28%, white)`,
      }}
    >
      {TEMPERATURE_LABEL[temperature]}
    </span>
  );
}
