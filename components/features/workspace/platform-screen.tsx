"use client";

import { useActionState } from "react";
import { extendTrial, promoteWorkspace, setRequestStatus } from "@/app/(app)/platform/actions";
import { PageHeader } from "@/components/features/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { formatKarachi } from "@/lib/format/dates";
import { useActionToast } from "@/lib/hooks/use-action-toast";
import { trialDaysLeft } from "@/lib/workspace/trial";

type WorkspaceRow = {
  id: string;
  name: string;
  plan: "client" | "trial";
  trial_ends_at: string | null;
  created_at: string;
  owner: string | null;
};
type RequestRow = { id: string; created_at: string; workspace_id: string; kind: string; note: string | null; status: string };

const KIND_LABEL: Record<string, string> = { custom_site: "Custom site", default_crm: "Default CRM", upgrade: "Become a client" };

function WorkspaceActions({ w }: { w: WorkspaceRow }) {
  const [promoteState, promote, promoting] = useActionState(promoteWorkspace, null);
  const [extendState, extend, extending] = useActionState(extendTrial, null);
  useActionToast(promoteState);
  useActionToast(extendState);
  if (w.plan === "client") return <span className="text-small text-tl-muted">Client</span>;
  return (
    <div className="flex gap-2">
      <form action={extend}>
        <input type="hidden" name="workspaceId" value={w.id} />
        <Button type="submit" size="sm" variant="secondary" disabled={extending}>
          +7 days
        </Button>
      </form>
      <form action={promote}>
        <input type="hidden" name="workspaceId" value={w.id} />
        <Button type="submit" size="sm" disabled={promoting}>
          Make client
        </Button>
      </form>
    </div>
  );
}

function RequestStatus({ r }: { r: RequestRow }) {
  const [state, action, pending] = useActionState(setRequestStatus, null);
  useActionToast(state);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="requestId" value={r.id} />
      <select
        name="status"
        defaultValue={r.status}
        aria-label="Request status"
        className="h-8 rounded-control border border-tl-line-strong bg-tl-surface px-2 text-label text-tl-text"
      >
        <option value="new">New</option>
        <option value="in_progress">In progress</option>
        <option value="done">Done</option>
      </select>
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        Save
      </Button>
    </form>
  );
}

/** The QuantraPro team's view across every workspace. */
export function PlatformScreen({ workspaces, requests }: { workspaces: WorkspaceRow[]; requests: RequestRow[] }) {
  const names = new Map(workspaces.map((w) => [w.id, w.name]));
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="All workspaces" description="Clients and demos. Promote a demo when they sign, or give a prospect more time." />
      <Card>
        <CardHeader title={`Workspaces (${workspaces.length})`} />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body">
            <thead>
              <tr className="text-label text-tl-muted">
                <th className="py-2 pr-4 font-medium">Company</th>
                <th className="py-2 pr-4 font-medium">Owner</th>
                <th className="py-2 pr-4 font-medium">Plan</th>
                <th className="py-2 pr-4 font-medium">Demo left</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {workspaces.map((w) => {
                const left = trialDaysLeft(w.plan, w.trial_ends_at);
                return (
                  <tr key={w.id} className="border-t border-tl-line">
                    <td className="py-3 pr-4 font-semibold text-tl-text">{w.name}</td>
                    <td className="py-3 pr-4">{w.owner ?? "-"}</td>
                    <td className="py-3 pr-4">{w.plan === "client" ? "Client" : "Demo"}</td>
                    <td className="py-3 pr-4 tl-amount">{left === null ? "-" : left === 0 ? "Ended" : `${left} days`}</td>
                    <td className="py-3">
                      <WorkspaceActions w={w} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader title="Requests" description="Custom sites, the default CRM and upgrades." />
        {requests.length === 0 ? (
          <p className="text-body text-tl-muted">No requests yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-tl-line">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-col gap-0.5">
                  <span className="text-body font-semibold text-tl-text">
                    {names.get(r.workspace_id) ?? "Unknown"} · {KIND_LABEL[r.kind] ?? r.kind}
                  </span>
                  {r.note ? <span className="max-w-[70ch] text-body text-tl-text-2">{r.note}</span> : null}
                  <span className="text-small text-tl-muted">{formatKarachi(r.created_at)}</span>
                </div>
                <RequestStatus r={r} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
