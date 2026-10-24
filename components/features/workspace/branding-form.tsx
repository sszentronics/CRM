"use client";

import { useActionState, useState } from "react";
import { resetBranding, saveBranding } from "@/app/(app)/workspace/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useActionToast } from "@/lib/hooks/use-action-toast";
import { contrastWithWhite, DEFAULT_THEME, type WorkspaceTheme } from "@/lib/workspace/theme";

const swatchClass = "h-10 w-full cursor-pointer rounded-control border border-tl-line-strong bg-tl-surface p-1";

/** Client workspaces: name and two colours, with a live preview that does not change the page until saved. */
export function BrandingForm({ name, theme }: { name: string; theme: WorkspaceTheme }) {
  const [state, action, pending] = useActionState(saveBranding, null);
  const [resetState, resetAction, resetting] = useActionState(resetBranding, null);
  useActionToast(state);
  useActionToast(resetState);
  const [primary, setPrimary] = useState(theme.primary);
  const [rail, setRail] = useState(theme.rail);
  const [label, setLabel] = useState(name);
  const lowPrimary = contrastWithWhite(primary) < 4.5;
  const lowRail = contrastWithWhite(rail) < 4.5;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <form action={action} className="flex flex-col gap-4" noValidate>
        <Input
          label="Company name"
          name="name"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={60}
          error={state?.fieldErrors?.name?.[0]}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="brand-primary"
            label="Main colour"
            hint="Buttons, links and highlights."
            error={state?.fieldErrors?.primary?.[0] ?? (lowPrimary ? "Too light for white button text. Pick a darker one." : undefined)}
          >
            <input id="brand-primary" name="primary" type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className={swatchClass} />
          </Field>
          <Field
            id="brand-rail"
            label="Sidebar colour"
            hint="Behind your logo and the menu."
            error={state?.fieldErrors?.rail?.[0] ?? (lowRail ? "Too light for white text. Pick a darker one." : undefined)}
          >
            <input id="brand-rail" name="rail" type="color" value={rail} onChange={(e) => setRail(e.target.value)} className={swatchClass} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending || lowPrimary || lowRail}>
            {pending ? "Saving" : "Save branding"}
          </Button>
          <Button
            type="submit"
            variant="secondary"
            formAction={resetAction}
            disabled={resetting}
            onClick={() => {
              setPrimary(DEFAULT_THEME.primary);
              setRail(DEFAULT_THEME.rail);
            }}
          >
            Reset to default
          </Button>
        </div>
      </form>

      <div aria-hidden className="overflow-hidden rounded-card border border-tl-line">
        <div className="flex h-12 items-center gap-2 px-4 text-label font-semibold text-white" style={{ background: rail }}>
          <span className="flex size-6 items-center justify-center rounded-control text-small" style={{ background: primary }}>
            {label.charAt(0).toUpperCase() || "?"}
          </span>
          <span className="truncate">{label || "Your company"}</span>
        </div>
        <div className="flex flex-col gap-3 bg-tl-surface p-4">
          <span className="w-fit rounded-control px-3 py-1.5 text-label font-semibold text-white" style={{ background: primary }}>
            Save call
          </span>
          <span className="text-label font-semibold" style={{ color: primary }}>
            A link
          </span>
        </div>
      </div>
    </div>
  );
}
