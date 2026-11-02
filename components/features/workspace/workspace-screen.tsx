import { PageHeader } from "@/components/features/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { formatKarachi } from "@/lib/format/dates";
import type { Workspace } from "@/lib/workspace/get";
import { DEFAULT_THEME } from "@/lib/workspace/theme";
import { trialDaysLeft } from "@/lib/workspace/trial";
import { BrandingForm } from "./branding-form";
import { ChooseCrm } from "./choose-crm";
import { RequestForm } from "./request-form";

export type RequestRow = { id: string; created_at: string; kind: string; note: string | null; status: string };

const KIND_LABEL: Record<string, string> = {
  custom_site: "Custom site",
  default_crm: "Default CRM",
  upgrade: "Become a client",
};

/** The owner's page: plan, setup choice, requests to the QuantraPro team, and branding for clients. */
export function WorkspaceScreen({ workspace, requests }: { workspace: Workspace; requests: RequestRow[] }) {
  const daysLeft = trialDaysLeft(workspace.plan, workspace.trialEndsAt);
  const isClient = workspace.plan === "client";
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Workspace"
        description={
          isClient
            ? "Your company's own space. Name and colours are yours to set."
            : `A 14-day demo. ${daysLeft === 1 ? "1 day" : `${daysLeft} days`} left, and your data is kept.`
        }
      />

      {workspace.slug ? (
        <Card>
          <CardHeader title="Your sign-in page" description="Share this address with your team. It opens a sign-in page with your name, logo and colours." />
          <code className="rounded-control bg-tl-raised px-3 py-2 text-body text-tl-text">/c/{workspace.slug}</code>
        </Card>
      ) : null}

      {!isClient && workspace.product !== "crm" ? (
        <Card>
          <CardHeader title="Choose your setup" description="Start with the default CRM now, or ask us for a custom site." />
          <ChooseCrm />
        </Card>
      ) : null}

      {isClient ? (
        <Card>
          <CardHeader title="Branding" description="Your name and colours replace the QuantraPro green for everyone in your company." />
          <BrandingForm name={workspace.name} theme={workspace.theme ?? DEFAULT_THEME} />
        </Card>
      ) : (
        <Card>
          <CardHeader title="Custom colours" description="Clients get their own colours and logo. Ask us and we will upgrade you." />
        </Card>
      )}

      <Card>
        <CardHeader title="Ask the QuantraPro team" description="A custom site, the default CRM, or an upgrade. We reply by email." />
        <RequestForm defaultKind={isClient ? "custom_site" : "upgrade"} />
      </Card>

      {requests.length > 0 ? (
        <Card>
          <CardHeader title="Your requests" />
          <ul className="flex flex-col divide-y divide-tl-line">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-col gap-0.5">
                  <span className="text-body font-semibold text-tl-text">{KIND_LABEL[r.kind] ?? r.kind}</span>
                  {r.note ? <span className="max-w-[70ch] text-body text-tl-text-2">{r.note}</span> : null}
                </div>
                <div className="flex flex-col items-end gap-0.5 text-small text-tl-muted">
                  <span className="rounded-full border border-tl-line px-2.5 py-0.5 text-tl-text-2">
                    {r.status === "new" ? "Received" : r.status === "in_progress" ? "In progress" : "Done"}
                  </span>
                  <span>{formatKarachi(r.created_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
