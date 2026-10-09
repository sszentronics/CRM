export const KARACHI_TZ = "Asia/Karachi";

type KarachiStyle = "datetime" | "date" | "time";

const formats: Record<KarachiStyle, Intl.DateTimeFormat> = {
  datetime: new Intl.DateTimeFormat("en-GB", {
    timeZone: KARACHI_TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }),
  date: new Intl.DateTimeFormat("en-GB", {
    timeZone: KARACHI_TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
  }),
  time: new Intl.DateTimeFormat("en-GB", {
    timeZone: KARACHI_TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }),
};

/** UTC instant to Karachi wall time: "8 Oct 2026, 3:00 pm". */
export function formatKarachi(value: Date | string, style: KarachiStyle = "datetime"): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid date: ${String(value)}`);
  return formats[style].format(date);
}

/** Short age for feeds and lists: "just now", "5 min", "2 h", "3 d", then the date. */
export function timeAgo(value: Date | string, now: Date = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d`;
  return formatKarachi(date, "date");
}

/** Karachi is UTC+5 all year (no daylight saving). */
const KARACHI_OFFSET_MS = 5 * 60 * 60 * 1000;

/** The Karachi wall-clock parts of an instant. */
export function karachiParts(at: Date) {
  const k = new Date(at.getTime() + KARACHI_OFFSET_MS);
  return { year: k.getUTCFullYear(), month: k.getUTCMonth(), day: k.getUTCDate(), hour: k.getUTCHours(), minute: k.getUTCMinutes() };
}

/** The instant for a Karachi wall-clock time. */
export function fromKarachi(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(Date.UTC(year, month, day, hour, minute) - KARACHI_OFFSET_MS);
}

/** "2026-10-09T15:00" typed in a datetime-local input, read as Karachi time. */
export function karachiInputToDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  return fromKarachi(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
}

/** The datetime-local value for an instant, in Karachi time. */
export function dateToKarachiInput(at: Date): string {
  const p = karachiParts(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month + 1)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** Start and end of the Karachi day containing `at`. */
export function karachiDayBounds(at: Date = new Date()) {
  const p = karachiParts(at);
  return { start: fromKarachi(p.year, p.month, p.day), end: fromKarachi(p.year, p.month, p.day + 1) };
}

/** Quick follow-up choices (Karachi time). Working hours are 10 am to 7 pm. */
export function followUpQuickPicks(now: Date = new Date()) {
  const p = karachiParts(now);
  const inTwoHours = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const roundTo15 = (d: Date) => new Date(Math.ceil(d.getTime() / (15 * 60_000)) * 15 * 60_000);
  return [
    { key: "2h", label: "In 2 hours", at: roundTo15(inTwoHours) },
    { key: "tomorrow", label: "Tomorrow 11 am", at: fromKarachi(p.year, p.month, p.day + 1, 11) },
    { key: "2d", label: "In 2 days", at: fromKarachi(p.year, p.month, p.day + 2, 11) },
    { key: "week", label: "Next week", at: fromKarachi(p.year, p.month, p.day + 7, 11) },
  ];
}

/** "today at 3:00 pm", "tomorrow at 11:00 am", or "Fri 10 Oct at 3:00 pm". */
export function describeWhen(at: Date, now: Date = new Date()): string {
  const time = formatKarachi(at, "time");
  const day = karachiDayBounds(now);
  if (at >= day.start && at < day.end) return `today at ${time}`;
  const tomorrowEnd = new Date(day.end.getTime() + 24 * 60 * 60 * 1000);
  if (at >= day.end && at < tomorrowEnd) return `tomorrow at ${time}`;
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: KARACHI_TZ, weekday: "short", day: "numeric", month: "short" }).format(at);
  return `${date} at ${time}`;
}

/** True when `value` is more than `days` days before `now`. */
export function olderThanDays(value: string | Date, days: number, now: Date = new Date()): boolean {
  return now.getTime() - new Date(value).getTime() > days * 86_400_000;
}

/** Today's calendar date in Karachi as YYYY-MM-DD. */
export function karachiToday(now: Date = new Date()): string {
  return dateToKarachiInput(now).slice(0, 10);
}
