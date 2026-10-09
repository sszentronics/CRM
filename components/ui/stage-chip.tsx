import { STAGE_COLOR_VAR, STAGE_LABEL, type Stage } from "@/lib/leads/stages";
import { cn } from "@/lib/utils";

/** Stage colour as text, 10% fill, 28% border. Always shows the name. */
export function StageChip({ stage, className }: { stage: Stage; className?: string }) {
  const c = `var(${STAGE_COLOR_VAR[stage]})`;
  return (
    <span
      data-stage={stage}
      className={cn(
        "inline-flex h-6 items-center rounded-full border px-2.5 text-small font-semibold whitespace-nowrap",
        className,
      )}
      style={{
        color: c,
        backgroundColor: `color-mix(in srgb, ${c} 10%, white)`,
        borderColor: `color-mix(in srgb, ${c} 28%, white)`,
      }}
    >
      {STAGE_LABEL[stage]}
    </span>
  );
}
