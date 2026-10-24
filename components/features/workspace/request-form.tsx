"use client";

import { useActionState } from "react";
import { requestHelp } from "@/app/(app)/workspace/actions";
import { Button } from "@/components/ui/button";
import { Field, controlClass } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { useActionToast } from "@/lib/hooks/use-action-toast";

type Kind = "custom_site" | "default_crm" | "upgrade";

const OPTIONS: { value: Kind; label: string }[] = [
  { value: "custom_site", label: "A custom site" },
  { value: "default_crm", label: "The default CRM" },
  { value: "upgrade", label: "Become a client (custom colours)" },
];

/** Sends a request to the QuantraPro team. */
export function RequestForm({ defaultKind = "custom_site" }: { defaultKind?: Kind }) {
  const [state, action, pending] = useActionState(requestHelp, null);
  useActionToast(state);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Select label="What do you need?" name="kind" defaultValue={defaultKind} options={OPTIONS} error={state?.fieldErrors?.kind?.[0]} />
      <Field id="request-note" label="Tell us about it" hint="Your brand, the features you need, and when." error={state?.fieldErrors?.note?.[0]}>
        <textarea id="request-note" name="note" rows={4} maxLength={1000} className={`${controlClass} h-auto py-2`} />
      </Field>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Sending" : "Send request"}
        </Button>
      </div>
    </form>
  );
}
