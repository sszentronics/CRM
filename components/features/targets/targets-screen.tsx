"use client";

import { Copy, Lock } from "lucide-react";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { saveTargets } from "@/app/(app)/targets/actions";
import { PageHeader } from "@/components/features/shell/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatPKR, parsePKR } from "@/lib/format/money";
import { addMonths, formatMonth } from "@/lib/format/months";
import { useActionToast } from "@/lib/hooks/use-action-toast";
import { teamColorVar, type TeamColor } from "@/lib/teams";
import { cn } from "@/lib/utils";

type Team = { id: string; name: string; color: TeamColor };

const cellKey = (teamId: string, month: string) => `${teamId}:${month}`;
const withCommas = (n: number) => n.toLocaleString("en-US");

type GridProps = {
  teams: Team[];
  months: string[];
  thisMonth: string;
  values: Record<string, number>;
};

/** Holds the save action, so its result survives the refresh that follows a save. */
export function TargetsScreen(props: GridProps) {
  const [state, action, pending] = useActionState(saveTargets, null);
  useActionToast(state);
  return (
    <TargetsGrid
      // Start again from what is stored whenever the saved values change.
      key={JSON.stringify(props.values)}
      {...props}
      state={state}
      action={action}
      pending={pending}
    />
  );
}

function TargetsGrid({
  teams,
  months,
  thisMonth,
  values,
  state,
  action,
  pending,
}: GridProps & {
  state: Awaited<ReturnType<typeof saveTargets>>;
  action: (formData: FormData) => void;
  pending: boolean;
}) {
  const initial = useMemo(
    () => Object.fromEntries(Object.entries(values).map(([k, v]) => [k, withCommas(v)])),
    [values],
  );
  const [cells, setCells] = useState<Record<string, string>>(initial);

  const locked = (m: string) => m < thisMonth;
  const changed = Object.keys(cells).filter((k) => (cells[k] ?? "") !== (initial[k] ?? "")).length;

  const total = (month: string) =>
    teams.reduce((sum, t) => sum + (parsePKR(cells[cellKey(t.id, month)] ?? "") ?? 0), 0);

  function copyFromPrevious(month: string) {
    const prev = addMonths(month, -1);
    setCells((c) => {
      const next = { ...c };
      for (const t of teams) {
        const v = c[cellKey(t.id, prev)];
        if (v) next[cellKey(t.id, month)] = v;
      }
      return next;
    });
  }

  if (teams.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Targets" />
        <EmptyState
          title="No teams yet."
          body="Targets are set per team. Create teams first."
          action={
            <Link href="/users" className={buttonVariants()}>
              Go to Users and teams
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <PageHeader
        title="Targets"
        description="Monthly verified-deposit targets per team, in rupees. Past months are locked."
        actions={
          <>
            {changed > 0 ? (
              <span className="text-label text-tl-muted">
                {changed} unsaved {changed === 1 ? "change" : "changes"}
              </span>
            ) : null}
            <Button type="submit" disabled={pending || changed === 0}>
              {pending ? "Saving" : "Save targets"}
            </Button>
          </>
        }
      />

      <div className="overflow-x-auto rounded-card border border-tl-line bg-tl-surface shadow-card">
        <table className="w-full min-w-[880px] border-collapse text-left">
          <caption className="sr-only">Targets by team and month</caption>
          <thead className="bg-tl-bg">
            <tr>
              <th scope="col" className="sticky left-0 z-10 w-56 border-b border-tl-line bg-tl-bg px-4 py-3 text-label font-semibold text-tl-muted">
                Team
              </th>
              {months.map((m) => (
                <th
                  key={m}
                  scope="col"
                  className={cn(
                    "border-b border-tl-line px-3 py-3 align-top text-label font-semibold",
                    m === thisMonth ? "bg-tl-primary-soft text-tl-primary" : "text-tl-muted",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    {locked(m) ? <Lock aria-hidden className="size-3.5" /> : null}
                    {formatMonth(m)}
                    {m === thisMonth ? <span className="font-normal">(this month)</span> : null}
                    {locked(m) ? <span className="sr-only">(locked)</span> : null}
                  </span>
                  {!locked(m) ? (
                    <button
                      type="button"
                      onClick={() => copyFromPrevious(m)}
                      className="mt-1 inline-flex items-center gap-1 text-small font-semibold text-tl-link hover:underline"
                      aria-label={`Copy ${formatMonth(addMonths(m, -1))} into ${formatMonth(m)}`}
                    >
                      <Copy aria-hidden className="size-3" />
                      Copy last month
                    </button>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t.id} className="border-b border-tl-line">
                <th scope="row" className="sticky left-0 z-10 bg-tl-surface px-4 py-2 text-body font-semibold text-tl-text">
                  <span className="inline-flex items-center gap-2">
                    <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: teamColorVar(t.color) }} />
                    {t.name}
                  </span>
                </th>
                {months.map((m) => {
                  const k = cellKey(t.id, m);
                  const name = `t:${k}`;
                  const err = state?.fieldErrors?.[name]?.[0];
                  if (locked(m)) {
                    const v = parsePKR(cells[k] ?? "");
                    return (
                      <td key={m} className="px-3 py-2 text-right tl-amount text-body text-tl-muted">
                        {v === null ? "Not set" : formatPKR(v)}
                      </td>
                    );
                  }
                  return (
                    <td key={m} className={cn("px-2 py-2", m === thisMonth && "bg-tl-primary-soft/40")}>
                      <label className="sr-only" htmlFor={name}>
                        {`${t.name} target for ${formatMonth(m)}`}
                      </label>
                      <div className="relative">
                        <span aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-small text-tl-muted">
                          Rs
                        </span>
                        <input
                          id={name}
                          name={name}
                          inputMode="numeric"
                          value={cells[k] ?? ""}
                          placeholder="0"
                          aria-invalid={err ? true : undefined}
                          onChange={(e) => setCells((c) => ({ ...c, [k]: e.target.value }))}
                          onBlur={(e) => {
                            const v = parsePKR(e.target.value);
                            if (v !== null) setCells((c) => ({ ...c, [k]: withCommas(v) }));
                          }}
                          className={cn(
                            "tl-amount h-9 w-full rounded-control border border-tl-line-strong bg-tl-surface pr-2.5 pl-8 text-right text-body text-tl-text placeholder:text-tl-muted focus-visible:border-tl-primary aria-invalid:border-tl-danger",
                            (cells[k] ?? "") !== (initial[k] ?? "") && "border-tl-primary bg-tl-primary-soft/50",
                          )}
                        />
                      </div>
                      {err ? <p className="mt-1 text-small text-tl-danger">{err}</p> : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-tl-bg">
            <tr>
              <th scope="row" className="sticky left-0 z-10 bg-tl-bg px-4 py-3 text-body font-semibold text-tl-text">
                Company total
              </th>
              {months.map((m) => (
                <td key={m} className="px-3 py-3 text-right tl-display tl-amount text-body text-tl-text">
                  {formatPKR(total(m))}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </form>
  );
}
