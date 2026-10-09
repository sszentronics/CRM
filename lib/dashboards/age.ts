export type Tone = "default" | "wait" | "danger";

/** Work queue tiles turn amber after 12 hours and red after 24. */
export const AMBER_AFTER_HOURS = 12;
export const RED_AFTER_HOURS = 24;

const HOUR = 3_600_000;

/** Colour for the oldest waiting item. Nothing waiting is never coloured. */
export function ageTone(oldest: string | Date | null, count: number, now: Date = new Date()): Tone {
  if (!oldest || count === 0) return "default";
  const hours = (now.getTime() - new Date(oldest).getTime()) / HOUR;
  return hours >= RED_AFTER_HOURS ? "danger" : hours >= AMBER_AFTER_HOURS ? "wait" : "default";
}

/** The word that carries the colour's meaning, so colour is never the only signal. */
export function ageNote(oldest: string | Date | null, count: number, now: Date = new Date()): string {
  if (!oldest || count === 0) return "Nothing waiting";
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(oldest).getTime()) / 60_000));
  const age = minutes < 60 ? `${minutes} min` : minutes < 2_880 ? `${Math.floor(minutes / 60)} h` : `${Math.floor(minutes / 1_440)} days`;
  const tone = ageTone(oldest, count, now);
  return `Oldest ${age}${tone === "danger" ? ", overdue" : tone === "wait" ? ", getting old" : ""}`;
}
