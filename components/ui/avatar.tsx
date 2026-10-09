import Image from "next/image";
import { teamColorVar, type TeamColor } from "@/lib/teams";
import { cn } from "@/lib/utils";

export type AvatarSize = 28 | 40 | 64 | 96;

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

const textSize: Record<AvatarSize, string> = {
  28: "text-[11px]",
  40: "text-label",
  64: "text-title",
  96: "text-display-m",
};

/** Round photo, or initials on soft purple, with a 2 px ring in the team colour. */
export function Avatar({
  name,
  src,
  size = 40,
  team,
  className,
}: {
  name: string;
  src?: string | null;
  size?: AvatarSize;
  team?: TeamColor;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-tl-primary-soft font-semibold text-tl-primary",
        textSize[size],
        className,
      )}
      style={{
        width: size,
        height: size,
        boxShadow: team ? `0 0 0 2px var(--tl-surface), 0 0 0 4px ${teamColorVar(team)}` : undefined,
      }}
    >
      {src ? (
        <Image src={src} alt={name} width={size} height={size} className="size-full object-cover" unoptimized />
      ) : (
        <>
          <span aria-hidden>{initials(name)}</span>
          <span className="sr-only">{name}</span>
        </>
      )}
    </span>
  );
}
