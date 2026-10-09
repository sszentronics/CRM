import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge must know our type scale (DESIGN.md section 4). Otherwise it reads
 * `text-label` as a colour and drops `text-white` (or the reverse) when classes merge.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["display-xl", "display-l", "display-m", "title", "body", "label", "small"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
