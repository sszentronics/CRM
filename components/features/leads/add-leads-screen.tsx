"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { createLead } from "@/app/(app)/leads/add/actions";
import { PageHeader } from "@/components/features/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { useActionToast } from "@/lib/hooks/use-action-toast";
import { useKeepFormOnError } from "@/lib/hooks/use-keep-form";
import { ImportWizard } from "./import-wizard";

type Panel = "single" | "import";

function SingleLeadForm({ sources }: { sources: string[] }) {
  const [state, action, pending] = useActionState(createLead, null);
  const form = useRef<HTMLFormElement>(null);
  const keepOnError = useKeepFormOnError(form, state);
  const nameInput = useRef<HTMLInputElement>(null);
  // "Save and add another": clear the form and start again on the name.
  useActionToast(state, () => {
    form.current?.reset();
    nameInput.current?.focus();
  });
  const errors = state?.fieldErrors ?? {};
  const duplicateId = state?.data?.duplicateLeadId;

  // Keep the chosen source after "Save and add another": imports from one campaign usually share it.
  const [lastSource, setLastSource] = useState("");
  useEffect(() => {
    if (state?.ok && form.current) {
      const select = form.current.elements.namedItem("source") as HTMLSelectElement | null;
      if (select && lastSource) select.value = lastSource;
    }
  }, [state, lastSource]);

  return (
    <Card className="max-w-3xl">
      <form ref={form} onSubmitCapture={keepOnError} action={action} className="flex flex-col gap-5" noValidate>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Input
              ref={nameInput}
              label="Full name"
              name="full_name"
              autoFocus
              autoComplete="off"
              error={errors.full_name?.[0]}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Input
              label="Phone"
              name="phone"
              inputMode="tel"
              placeholder="0300 1234567 or +1 415 555 0100"
              hint="Any country. Start with + and the country code for a number outside Pakistan."
              autoComplete="off"
              error={errors.phone?.[0]}
            />
            {typeof duplicateId === "string" ? (
              <Link href={`/lead/${duplicateId}`} className="text-small font-semibold text-tl-link hover:underline">
                Open the existing lead
              </Link>
            ) : null}
          </div>
          <Select
            label="Source"
            name="source"
            placeholder="Choose a source"
            options={sources.map((s) => ({ value: s, label: s }))}
            defaultValue=""
            onChange={(e) => setLastSource(e.target.value)}
            error={errors.source?.[0]}
          />
          <Input label="City" name="city" hint="Optional." error={errors.city?.[0]} />
          <Input label="Campaign" name="campaign" hint="Optional. The ad or PR campaign." error={errors.campaign?.[0]} />
          <div className="flex flex-col gap-1 md:col-span-2">
            <label htmlFor="lead-notes" className="text-label font-medium text-tl-text">
              Notes
            </label>
            <textarea
              id="lead-notes"
              name="notes"
              rows={3}
              maxLength={1000}
              className="w-full rounded-control border border-tl-line-strong bg-tl-surface px-3 py-2 text-body text-tl-text placeholder:text-tl-muted focus-visible:border-tl-primary"
              placeholder="Optional. Anything the agent should know before calling."
            />
            {errors.notes ? <p className="text-small font-medium text-tl-danger">{errors.notes[0]}</p> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-tl-line pt-5">
          <p className="mr-auto text-small text-tl-muted">New leads go into the pool with no team. Distribution comes next.</p>
          <Button type="submit" name="intent" value="another" variant="secondary" disabled={pending}>
            Save and add another
          </Button>
          <Button type="submit" name="intent" value="save" disabled={pending}>
            {pending ? "Saving" : "Save"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function AddLeadsScreen({ sources }: { sources: string[] }) {
  const [panel, setPanel] = useState<Panel>("single");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Add leads"
        description="Add one lead by hand, or import a spreadsheet from a campaign. Numbers already in the system are skipped."
      />
      <Tabs
        idPrefix="add-leads"
        label="How to add leads"
        value={panel}
        onChange={setPanel}
        items={[
          { value: "single", label: "One lead" },
          { value: "import", label: "Import a file" },
        ]}
      />
      <section id={`add-leads-panel-${panel}`} role="tabpanel" aria-labelledby={`add-leads-tab-${panel}`}>
        {panel === "single" ? <SingleLeadForm sources={sources} /> : <ImportWizard sources={sources} />}
      </section>
    </div>
  );
}
