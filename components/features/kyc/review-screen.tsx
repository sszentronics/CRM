"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/features/shell/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Sheet } from "@/components/ui/sheet";
import { Tabs } from "@/components/ui/tabs";
import { formatKarachi, olderThanDays, timeAgo } from "@/lib/format/dates";
import { maskTail } from "@/lib/format/mask";
import { formatCnic, formatIban, INCOME_BANDS, KYC_FIELD_LABELS, missingFields, RISK_LEVELS, type KycValues } from "@/lib/kyc/fields";
import { cn } from "@/lib/utils";
import { Checklist, type DocumentRow } from "./checklist";

export type ReviewProfile = KycValues & {
  id: string;
  status: "incomplete" | "submitted" | "approved";
  checklist: string[];
  updated_at: string;
  broker: { name: string } | null;
  lead: { id: string; full_name: string; agent: { full_name: string } | null; team: { name: string } | null } | null;
  documents: DocumentRow[];
};

type Panel = "waiting" | "all";

/** Documents waiting longer than this are shown in red. */
const REVIEW_DAYS = 2;

function waitingDocs(p: ReviewProfile) {
  return p.documents.filter((d) => d.status === "collected" && p.checklist.includes(d.type));
}

function Field({ name, value }: { name: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-tl-line py-2 last:border-b-0">
      <dt className="text-label text-tl-muted">{name}</dt>
      <dd className="text-right text-body text-tl-text">{value ?? <span className="text-tl-danger">Missing</span>}</dd>
    </div>
  );
}

const label = (list: readonly { value: string; label: string }[], v: string | null) => (v ? (list.find((x) => x.value === v)?.label ?? v) : null);
const yesNo = (v: boolean | null) => (v === null ? null : v ? "Yes" : "No");

export function ReviewScreen({ profiles }: { profiles: ReviewProfile[] }) {
  const [panel, setPanel] = useState<Panel>("waiting");
  const [openId, setOpenId] = useState<string | null>(null);

  const waiting = useMemo(
    () =>
      profiles
        .map((p) => ({ p, docs: waitingDocs(p) }))
        .filter((x) => x.docs.length > 0)
        .sort((a, b) => Math.min(...a.docs.map((d) => +new Date(d.collected_at))) - Math.min(...b.docs.map((d) => +new Date(d.collected_at)))),
    [profiles],
  );
  const rows = panel === "waiting" ? waiting.map((x) => x.p) : profiles;
  const open = profiles.find((p) => p.id === openId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Document review"
        description="Check each collected document against the broker's system or the original, then approve or reject it. No copies are kept in the CRM."
      />
      <Tabs
        idPrefix="review"
        label="Queue"
        value={panel}
        onChange={setPanel}
        items={[
          { value: "waiting", label: "Waiting for review", count: waiting.length },
          { value: "all", label: "All in progress", count: profiles.length },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState title="Nothing to review." body="Clients appear here when an agent marks documents collected." />
      ) : (
        <div className="overflow-x-auto rounded-card border border-tl-line bg-tl-surface shadow-card">
          <table className="w-full min-w-[820px] text-left">
            <caption className="sr-only">Clients with documents in progress</caption>
            <thead className="bg-tl-bg">
              <tr>
                {["Client", "Agent", "Broker", "CNIC", "Documents", "Waiting", ""].map((h, i) => (
                  <th key={i} scope="col" className="border-b border-tl-line px-4 py-2.5 text-label font-semibold text-tl-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const docs = waitingDocs(p);
                const oldest = docs.length ? docs.reduce((a, b) => (a.collected_at < b.collected_at ? a : b)).collected_at : null;
                const done = p.documents.filter((d) => d.status !== "rejected" && p.checklist.includes(d.type)).length;
                return (
                  <tr key={p.id} className="border-t border-tl-line first:border-t-0 hover:bg-tl-bg">
                    <td className="px-4 py-3">
                      <Link href={`/lead/${p.lead?.id}`} className="text-body font-semibold text-tl-text hover:text-tl-link hover:underline">
                        {p.lead?.full_name}
                      </Link>
                      <span className="block text-small text-tl-muted">{p.lead?.team?.name ?? "No team"}</span>
                    </td>
                    <td className="px-4 py-3 text-body text-tl-text-2">{p.lead?.agent?.full_name ?? "Nobody"}</td>
                    <td className="px-4 py-3 text-body text-tl-text-2">{p.broker?.name}</td>
                    <td className="tl-amount px-4 py-3 text-body text-tl-text-2">{p.cnic_number ? maskTail(p.cnic_number) : "Not given"}</td>
                    <td className="px-4 py-3 text-body text-tl-text-2">
                      <span className="tl-amount">
                        {done} of {p.checklist.length}
                      </span>
                      {docs.length ? <span className="ml-2 text-small font-semibold text-tl-wait">{docs.length} to check</span> : null}
                    </td>
                    <td className={cn("px-4 py-3 text-body", oldest && olderThanDays(oldest, REVIEW_DAYS) ? "font-semibold text-tl-danger" : "text-tl-muted")}>
                      {oldest ? timeAgo(oldest) : "Nothing waiting"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant={docs.length ? "primary" : "secondary"} onClick={() => setOpenId(p.id)} aria-label={`Review ${p.lead?.full_name}`}>
                        Review
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={open !== null} onClose={() => setOpenId(null)} title={open?.lead?.full_name ?? ""} description={open ? `${open.broker?.name}, ${open.lead?.agent?.full_name ?? "no agent"}` : undefined}>
        {open ? (
          <div className="flex flex-col gap-6">
            <section aria-label="Typed details" className="flex flex-col gap-2">
              <h3 className="text-title font-semibold text-tl-text">Details to check</h3>
              <dl>
                <Field name={KYC_FIELD_LABELS.cnic_number} value={open.cnic_number ? <span className="tl-amount">{formatCnic(open.cnic_number)}</span> : null} />
                <Field name={KYC_FIELD_LABELS.cnic_expiry} value={open.cnic_expiry ? formatKarachi(`${open.cnic_expiry}T12:00:00Z`, "date") : null} />
                <Field name={KYC_FIELD_LABELS.mother_name} value={open.mother_name} />
                <Field name={KYC_FIELD_LABELS.email} value={open.email} />
                <Field name={KYC_FIELD_LABELS.bank_name} value={open.bank_name} />
                <Field name={KYC_FIELD_LABELS.iban} value={open.iban ? <span className="tl-amount">{formatIban(open.iban)}</span> : null} />
                <Field name={KYC_FIELD_LABELS.income_band} value={label(INCOME_BANDS, open.income_band)} />
                <Field name={KYC_FIELD_LABELS.sim_in_own_name} value={yesNo(open.sim_in_own_name)} />
                <Field name={KYC_FIELD_LABELS.consent_at} value={open.consent_at ? `Given ${formatKarachi(open.consent_at, "date")}` : null} />
                <Field name={KYC_FIELD_LABELS.risk_level} value={label(RISK_LEVELS, open.risk_level)} />
                <Field name={KYC_FIELD_LABELS.is_pep} value={yesNo(open.is_pep)} />
              </dl>
              {missingFields(open).length > 0 ? (
                <p className="text-small text-tl-muted">{missingFields(open).length} details still missing. The agent fills them on the lead page.</p>
              ) : null}
            </section>
            <section aria-label="Checklist" className="flex flex-col gap-2">
              <h3 className="text-title font-semibold text-tl-text">Documents</h3>
              <Checklist profileId={open.id} checklist={open.checklist} documents={open.documents} canEdit={false} isAdmin />
            </section>
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
