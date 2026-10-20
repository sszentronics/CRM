"use client";

import { useActionState, useId } from "react";
import { sendResetForUser, setUserActive } from "@/app/(app)/users/actions";
import { ActionError } from "@/components/ui/action-error";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useActionToast } from "@/lib/hooks/use-action-toast";
import type { PersonRow } from "./users-screen";

export type ConfirmKind = "disable" | "enable" | "reset";

const COPY: Record<ConfirmKind, { title: (n: string) => string; body: string; button: string; danger: boolean }> = {
  disable: {
    title: (n) => `Disable ${n}?`,
    body: "They are signed out on every device at once and cannot sign in until you enable them again. Their open leads go back to their Team Lead.",
    button: "Disable account",
    danger: true,
  },
  enable: {
    title: (n) => `Enable ${n}?`,
    body: "They can sign in again with their existing password.",
    button: "Enable account",
    danger: false,
  },
  reset: {
    title: (n) => `Send ${n} a password reset?`,
    body: "They get an email with a link to choose a new password. Their current password keeps working until they do.",
    button: "Send reset link",
    danger: false,
  },
};

export function ConfirmDrawer({
  kind,
  person,
  onClose,
}: {
  kind: ConfirmKind | null;
  person: PersonRow | null;
  onClose: () => void;
}) {
  const formId = useId();
  const [state, action, pending] = useActionState(kind === "reset" ? sendResetForUser : setUserActive, null);
  useActionToast(state, onClose);
  const copy = kind ? COPY[kind] : null;

  return (
    <Sheet
      open={kind !== null && person !== null}
      onClose={onClose}
      title={copy && person ? copy.title(person.full_name) : ""}
      footer={
        copy ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form={formId} variant={copy.danger ? "danger" : "primary"} disabled={pending}>
              {pending ? "Working" : copy.button}
            </Button>
          </>
        ) : null
      }
    >
      {copy && person ? (
        <form id={formId} action={action} className="flex flex-col gap-4">
          <ActionError state={state} />
          <input type="hidden" name="id" value={person.id} />
          {kind !== "reset" ? <input type="hidden" name="active" value={String(kind === "enable")} /> : null}
          <p className="text-body text-tl-text-2">{copy.body}</p>
        </form>
      ) : null}
    </Sheet>
  );
}
