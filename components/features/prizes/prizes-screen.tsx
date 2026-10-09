"use client";

import { useActionState } from "react";
import { savePrizes } from "@/app/(app)/prizes/actions";
import { PageHeader } from "@/components/features/shell/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatPKR } from "@/lib/format/money";
import { formatMonth } from "@/lib/format/months";
import { useActionToast } from "@/lib/hooks/use-action-toast";
import type { ActionState } from "@/lib/forms";
import { teamColorVar, type TeamColor } from "@/lib/teams";

type Team = { id: string; name: string; color: TeamColor };

/** Holds the save action, so its result survives the refresh that follows a save. */
export function PrizesScreen(props: { teams: Team[]; months: string[]; values: Record<string, string>; targets: Record<string, number> }) {
  const [state, action, pending] = useActionState(savePrizes, null);
  useActionToast(state);
  return <PrizesGrid key={JSON.stringify(props.values)} {...props} state={state} action={action} pending={pending} />;
}

function PrizesGrid({
  teams,
  months,
  values,
  targets,
  state,
  action,
  pending,
}: {
  teams: Team[];
  months: string[];
  values: Record<string, string>;
  targets: Record<string, number>;
  state: ActionState;
  action: (formData: FormData) => void;
  pending: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Team prizes"
        description="One prize per team per month, won by the whole team when it reaches its monthly target. It shows on the team lane in the Arena. Leave a box empty for no prize."
      />
      {teams.length === 0 ? (
        <EmptyState title="No teams yet." body="Add a team first, then set its prize here." />
      ) : (
        <form action={action} className="flex flex-col gap-4" noValidate>
          <div className="overflow-x-auto rounded-card border border-tl-line bg-tl-surface shadow-card">
            <table className="w-full min-w-[720px] text-left">
              <caption className="sr-only">Prize for each team and month</caption>
              <thead className="bg-tl-bg">
                <tr>
                  <th scope="col" className="border-b border-tl-line px-4 py-2.5 text-label font-semibold text-tl-muted">
                    Team
                  </th>
                  {months.map((m) => (
                    <th key={m} scope="col" className="border-b border-tl-line px-4 py-2.5 text-label font-semibold text-tl-muted">
                      {formatMonth(m)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {teams.map((t) => (
                  <tr key={t.id} className="border-t border-tl-line first:border-t-0">
                    <th scope="row" className="px-4 py-3 text-left text-body font-semibold text-tl-text">
                      <span className="flex items-center gap-2">
                        <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: teamColorVar(t.color) }} />
                        {t.name}
                      </span>
                    </th>
                    {months.map((m) => {
                      const key = `${t.id}:${m}`;
                      const name = `p:${t.id}:${m}`;
                      const error = state?.fieldErrors?.[name]?.[0];
                      return (
                        <td key={m} className="px-4 py-3 align-top">
                          <input
                            name={name}
                            aria-label={`Prize for ${t.name}, ${formatMonth(m)}`}
                            defaultValue={values[key] ?? ""}
                            maxLength={80}
                            placeholder="For example, Team dinner"
                            aria-invalid={error ? true : undefined}
                            className="block h-10 w-full rounded-control border border-tl-line-strong bg-tl-surface px-3 text-body text-tl-text placeholder:text-tl-muted aria-invalid:border-tl-danger"
                          />
                          <span className="mt-1 block text-small text-tl-muted">
                            {targets[key] ? `Target ${formatPKR(targets[key])}` : "No target set"}
                          </span>
                          {error ? <span className="block text-small font-medium text-tl-danger">{error}</span> : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving" : "Save prizes"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
