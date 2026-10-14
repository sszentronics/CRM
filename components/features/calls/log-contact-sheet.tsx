"use client";

import { Mail, MessageCircle, MessageSquareText } from "lucide-react";
import { useActionState, useId, useState } from "react";
import { logContact } from "@/app/(app)/lead/[id]/actions";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useActionToast } from "@/lib/hooks/use-action-toast";
import { CHANNEL_LABEL, LOGGABLE_CHANNELS, type Temperature } from "@/lib/leads/contact";
import { formatPhone } from "@/lib/format/phone";
import { cn } from "@/lib/utils";
import { InterestField } from "./interest-field";

const ICON = { whatsapp: MessageCircle, message: MessageSquareText, email: Mail } as const;

/** Log a WhatsApp, message or email. The time is the moment you save; it cannot be backdated. */
export function LogContactSheet({
  lead,
  open,
  onClose,
  temperature,
}: {
  lead: { id: string; full_name: string; phone: string } | null;
  open: boolean;
  onClose: () => void;
  temperature: Temperature | null;
}) {
  const formId = useId();
  const [state, action, pending] = useActionState(logContact, null);
  const [channel, setChannel] = useState<string>("");
  const [interest, setInterest] = useState<Temperature | "">(temperature ?? "");
  const [notes, setNotes] = useState("");
  useActionToast(state, onClose);

  if (!lead) return null;
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <Sheet
      open={open}
      onClose={onClose}
      dirty={!!channel || notes.length > 0}
      title={`Log a message: ${lead.full_name}`}
      description={formatPhone(lead.phone)}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={pending || !channel}>
            {pending ? "Saving" : "Save"}
          </Button>
        </>
      }
    >
      <form id={formId} action={action} className="flex flex-col gap-5" noValidate>
        <input type="hidden" name="leadId" value={lead.id} />
        <input type="hidden" name="channel" value={channel} />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-label font-medium text-tl-text">How did you reach them?</legend>
          <div className="grid grid-cols-3 gap-2">
            {LOGGABLE_CHANNELS.map((c) => {
              const Icon = ICON[c];
              const on = channel === c;
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setChannel(c)}
                  className={cn(
                    "flex h-12 items-center justify-center gap-2 rounded-control border px-2 text-body font-semibold transition-colors",
                    on ? "border-tl-primary bg-tl-primary text-white" : "border-tl-line-strong bg-tl-surface text-tl-text hover:bg-tl-raised",
                  )}
                >
                  <Icon aria-hidden className="size-4 shrink-0" />
                  {CHANNEL_LABEL[c]}
                </button>
              );
            })}
          </div>
          {errors.channel ? <p className="text-small font-medium text-tl-danger">{errors.channel[0]}</p> : null}
          <p className="text-small text-tl-muted">Saved with today&apos;s date and the time you press Save.</p>
        </fieldset>

        <InterestField value={interest} onChange={setInterest} />

        <div className="flex flex-col gap-1">
          <label htmlFor={`${formId}-notes`} className="text-label font-medium text-tl-text">
            Notes (optional)
          </label>
          <textarea
            id={`${formId}-notes`}
            name="notes"
            rows={3}
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What did you send or hear back?"
            className="rounded-control border border-tl-line-strong bg-tl-surface px-3 py-2 text-body text-tl-text placeholder:text-tl-muted"
          />
        </div>
      </form>
    </Sheet>
  );
}
