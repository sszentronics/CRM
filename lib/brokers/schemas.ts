import { z } from "zod";
import { DOCUMENT_KEYS, MARKETS } from "./documents";

export const brokerSchema = z.object({
  id: z.uuid().optional(),
  name: z
    .string("Enter the broker's name.")
    .trim()
    .min(2, "Enter the broker's name.")
    .max(80, "Keep the name under 80 characters."),
  market: z.enum(
    MARKETS.map((m) => m.value) as [string, ...string[]],
    "Choose the market this broker trades on.",
  ),
  checklist: z
    .array(z.enum(DOCUMENT_KEYS as [string, ...string[]]))
    .min(1, "Tick at least one document clients must upload.")
    .transform((keys) => DOCUMENT_KEYS.filter((k) => keys.includes(k))),
});

export type BrokerInput = z.output<typeof brokerSchema>;
