/** Client colours. A client workspace may replace the QuantraPro green and the sidebar colour. */
export type WorkspaceTheme = { primary: string; rail: string };

export const DEFAULT_THEME: WorkspaceTheme = { primary: "#057940", rail: "#08150f" };

const HEX = /^#[0-9a-f]{6}$/i;

export function isHex(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

function channel(v: number) {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** WCAG contrast ratio of white text on `hex`. */
export function contrastWithWhite(hex: string) {
  return 1.05 / (luminance(hex) + 0.05);
}

/** A sentence the Superadmin can act on, or null when the colours are fine. White text sits on both colours. */
export function themeProblem(theme: WorkspaceTheme): string | null {
  if (!isHex(theme.primary) || !isHex(theme.rail)) return "Choose both colours with the colour picker.";
  if (contrastWithWhite(theme.primary) < 4.5) return "The main colour is too light for white button text. Pick a darker one.";
  if (contrastWithWhite(theme.rail) < 4.5) return "The sidebar colour is too light for white text. Pick a darker one.";
  return null;
}

/** Reads the JSON stored on the workspace; anything unexpected means the default look. */
export function parseTheme(raw: unknown): WorkspaceTheme | null {
  if (!raw || typeof raw !== "object") return null;
  const { primary, rail } = raw as Record<string, unknown>;
  return isHex(primary) && isHex(rail) ? { primary, rail } : null;
}

/**
 * CSS that re-points the brand tokens. Values are validated hex only, so nothing else can reach the stylesheet.
 * `html:root` outranks both :root and the dark theme block in tailwind-source.css.
 */
export function themeCss(theme: WorkspaceTheme | null): string {
  if (!theme || themeProblem(theme)) return "";
  const { primary: p, rail: r } = theme;
  return [
    "html:root{",
    `--tl-primary:${p};`,
    `--tl-primary-hover:color-mix(in srgb,${p} 82%,#000);`,
    `--tl-primary-soft:color-mix(in srgb,${p} 12%,var(--tl-surface));`,
    `--tl-link:${p};`,
    `--tl-focus:color-mix(in srgb,${p} 75%,#fff);`,
    `--tl-brand:${r};`,
    `--tl-brand-raised:color-mix(in srgb,${r} 82%,#fff);`,
    "}",
  ].join("");
}
