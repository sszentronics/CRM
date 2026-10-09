import { z } from "zod";

/** What every form action returns. `message` is shown as a toast or under the form. */
export type ActionState =
  | {
      ok: boolean;
      message?: string;
      fieldErrors?: Record<string, string[] | undefined>;
      /** Extra result for the form, e.g. the id of a duplicate to link to. */
      data?: Record<string, string | number | boolean | null>;
    }
  | null;

export function fieldErrors(error: z.ZodError): ActionState {
  return {
    ok: false,
    message: "Some fields need attention.",
    fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[] | undefined>,
  };
}

/** FormData to a plain object, treating empty strings as missing. */
export function formObject(formData: FormData): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string") out[k] = v.trim() === "" ? undefined : v;
  }
  return out;
}
