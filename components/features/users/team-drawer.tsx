"use client";

import { useActionState, useId, useRef, useState } from "react";
import { changeTeamLead, createTeam, updateTeam } from "@/app/(app)/users/actions";
import { ActionError } from "@/components/ui/action-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { useActionToast } from "@/lib/hooks/use-action-toast";
import { useKeepFormOnError } from "@/lib/hooks/use-keep-form";
import { TEAM_COLORS, teamColorVar, type TeamColor } from "@/lib/teams";
import { cn } from "@/lib/utils";
import type { PersonRow, TeamRow } from "./users-screen";

const COLOR_LABEL: Record<TeamColor, string> = {
  cyan: "Cyan",
  coral: "Coral",
  pink: "Pink",
  lemon: "Lemon",
  sky: "Sky",
  lilac: "Lilac",
};

function ColorPicker({ defaultValue, error }: { defaultValue?: TeamColor; error?: string }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-label font-medium text-tl-text">Team colour</legend>
      <div className="flex flex-wrap gap-2">
        {TEAM_COLORS.map((c) => (
          <label
            key={c}
            className="flex cursor-pointer items-center gap-2 rounded-control border border-tl-line-strong px-3 py-2 text-label font-medium text-tl-text has-[:checked]:border-tl-primary has-[:checked]:bg-tl-primary-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-tl-focus"
          >
            <input type="radio" name="color" value={c} defaultChecked={c === defaultValue} className="sr-only" />
            <span aria-hidden className="size-4 rounded-full" style={{ backgroundColor: teamColorVar(c) }} />
            {COLOR_LABEL[c]}
          </label>
        ))}
      </div>
      {error ? <p className="text-small font-medium text-tl-danger">{error}</p> : null}
    </fieldset>
  );
}

/** Team Leads who do not lead a team yet. */
function freeLeads(people: PersonRow[]) {
  return people
    .filter((p) => p.role === "team_lead" && p.is_active && !p.team_id)
    .map((p) => ({ value: p.id, label: p.full_name }));
}

function NoFreeLead() {
  return (
    <p className="rounded-control bg-tl-raised px-3 py-2.5 text-body text-tl-text-2">
      No Team Lead is free. Add a person with the Team Lead role first.
    </p>
  );
}

export function TeamDrawer({
  open,
  onClose,
  team,
  people,
}: {
  open: boolean;
  onClose: () => void;
  team: TeamRow | null;
  people: PersonRow[];
}) {
  const editing = team !== null;
  const formId = useId();
  const [state, action, pending] = useActionState(editing ? updateTeam : createTeam, null);
  const [dirty, setDirty] = useState(false);
  function close() {
    setDirty(false);
    onClose();
  }
  useActionToast(state, close);
  const formRef = useRef<HTMLFormElement>(null);
  const keepOnError = useKeepFormOnError(formRef, state);
  const errors = state?.fieldErrors ?? {};
  const leads = freeLeads(people);

  return (
    <Sheet
      open={open}
      onClose={close}
      dirty={dirty}
      title={editing ? `Edit ${team.name}` : "Add a team"}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={pending || (!editing && leads.length === 0)}>
            {pending ? "Saving" : editing ? "Save changes" : "Add team"}
          </Button>
        </>
      }
    >
      <form id={formId} ref={formRef} onSubmitCapture={keepOnError} action={action} onChange={() => setDirty(true)} className="flex flex-col gap-5" noValidate>
        <ActionError state={state} />
        {editing ? <input type="hidden" name="id" value={team.id} /> : null}
        <Input label="Team name" name="name" defaultValue={team?.name} error={errors.name?.[0]} />
        <ColorPicker defaultValue={team?.color} error={errors.color?.[0]} />
        {editing ? null : leads.length > 0 ? (
          <Select
            label="Team Lead"
            name="teamLeadId"
            placeholder="Choose the Team Lead"
            options={leads}
            defaultValue=""
            error={errors.teamLeadId?.[0]}
          />
        ) : (
          <NoFreeLead />
        )}
      </form>
    </Sheet>
  );
}

export function ChangeLeadDrawer({
  open,
  onClose,
  team,
  people,
}: {
  open: boolean;
  onClose: () => void;
  team: TeamRow | null;
  people: PersonRow[];
}) {
  const formId = useId();
  const [state, action, pending] = useActionState(changeTeamLead, null);
  useActionToast(state, onClose);
  const leadFormRef = useRef<HTMLFormElement>(null);
  const keepLeadOnError = useKeepFormOnError(leadFormRef, state);
  const leads = freeLeads(people);
  const current = people.find((p) => p.id === team?.team_lead_id);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={team ? `Change the Team Lead of ${team.name}` : "Change the Team Lead"}
      description={current ? `${current.full_name} leads this team today and will be free to lead another.` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={pending || leads.length === 0}>
            {pending ? "Saving" : "Change Team Lead"}
          </Button>
        </>
      }
    >
      {team ? (
        <form id={formId} ref={leadFormRef} onSubmitCapture={keepLeadOnError} action={action} className={cn("flex flex-col gap-4")} noValidate>
          <ActionError state={state} />
          <input type="hidden" name="teamId" value={team.id} />
          {leads.length > 0 ? (
            <Select
              label="New Team Lead"
              name="teamLeadId"
              placeholder="Choose the new Team Lead"
              options={leads}
              defaultValue=""
              error={state?.fieldErrors?.teamLeadId?.[0]}
            />
          ) : (
            <NoFreeLead />
          )}
        </form>
      ) : null}
    </Sheet>
  );
}
