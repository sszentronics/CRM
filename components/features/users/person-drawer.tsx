"use client";

import { useActionState, useId, useRef, useState } from "react";
import { createUser, updateUser } from "@/app/(app)/users/actions";
import { ActionError } from "@/components/ui/action-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { ROLE_LABEL, type Role } from "@/lib/auth/roles";
import { formatPhone } from "@/lib/format/phone";
import { useActionToast } from "@/lib/hooks/use-action-toast";
import { useKeepFormOnError } from "@/lib/hooks/use-keep-form";
import type { PersonRow, TeamRow } from "./users-screen";


const ROLE_HINT: Record<Role, string> = {
  superadmin: "Full control, including users, settings and the audit log. Signs in with a 6-digit code.",
  admin: "Runs lead distribution, document review and deposit checks. Signs in with a 6-digit code.",
  team_lead: "Leads one team. Choose their team from the Teams tab once they are added.",
  agent: "Works their own leads. Belongs to one team.",
  analyst: "Runs Technical Analysis sessions for referred clients.",
};

/** Add or edit a person. `person` set means edit. */
export function PersonDrawer({
  open,
  onClose,
  person,
  teams,
  roles,
}: {
  open: boolean;
  onClose: () => void;
  person: PersonRow | null;
  teams: TeamRow[];
  /** Roles the signed-in user may give. */
  roles: readonly Role[];
}) {
  const roleOptions = roles.map((r) => ({ value: r, label: ROLE_LABEL[r] }));
  const editing = person !== null;
  const formId = useId();
  const [state, action, pending] = useActionState(editing ? updateUser : createUser, null);
  const [role, setRole] = useState<Role>(person?.role ?? "agent");
  const [dirty, setDirty] = useState(false);

  function close() {
    setDirty(false);
    onClose();
  }
  useActionToast(state, close);
  const formRef = useRef<HTMLFormElement>(null);
  const keepOnError = useKeepFormOnError(formRef, state);

  const errors = state?.fieldErrors ?? {};
  const teamOptions = teams.filter((t) => t.is_active).map((t) => ({ value: t.id, label: t.name }));

  return (
    <Sheet
      open={open}
      onClose={close}
      dirty={dirty}
      title={editing ? `Edit ${person.full_name}` : "Add a person"}
      description={editing ? undefined : "They get an email with a link to set their password."}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={pending}>
            {pending ? "Saving" : editing ? "Save changes" : "Add person"}
          </Button>
        </>
      }
    >
      <form id={formId} ref={formRef} onSubmitCapture={keepOnError} action={action} onChange={() => setDirty(true)} className="flex flex-col gap-4" noValidate>
        <ActionError state={state} />
        {editing ? <input type="hidden" name="id" value={person.id} /> : null}
        <Input label="Full name" name="fullName" defaultValue={person?.full_name} error={errors.fullName?.[0]} />
        {editing ? (
          <Input label="Email" value={person.email} disabled hint="Email is the sign-in name and cannot change." />
        ) : (
          <Input label="Email" name="email" type="email" error={errors.email?.[0]} />
        )}
        <Input
          label="Phone"
          name="phone"
          inputMode="tel"
          placeholder="0300 1234567 or +1 415 555 0100"
          defaultValue={person?.phone ? formatPhone(person.phone) : undefined}
          hint="Optional. Any country: start with + and the country code."
          error={errors.phone?.[0]}
        />
        <Select
          label="Role"
          name="role"
          options={roleOptions}
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          hint={ROLE_HINT[role]}
          error={errors.role?.[0]}
        />
        {role === "agent" ? (
          teamOptions.length > 0 ? (
            <Select
              label="Team"
              name="teamId"
              placeholder="Choose a team"
              options={teamOptions}
              defaultValue={person?.role === "agent" ? (person.team_id ?? "") : ""}
              error={errors.teamId?.[0]}
            />
          ) : (
            <p className="rounded-control bg-tl-raised px-3 py-2.5 text-body text-tl-text-2">
              Create a team first. Agents always belong to a team.
            </p>
          )
        ) : null}
      </form>
    </Sheet>
  );
}
