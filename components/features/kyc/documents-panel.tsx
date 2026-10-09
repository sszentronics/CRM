"use client";

import { Wallet } from "lucide-react";
import { useActionState } from "react";
import { chooseBroker, saveKycFields } from "@/app/(app)/lead/[id]/kyc-actions";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { MARKETS, type Market } from "@/lib/brokers/documents";
import { useActionToast } from "@/lib/hooks/use-action-toast";
import { formatCnic, formatIban, INCOME_BANDS, KYC_FIELD_LABELS, missingFields, RISK_LEVELS, type KycValues } from "@/lib/kyc/fields";
import type { Stage } from "@/lib/leads/stages";
import { Checklist, type DocumentRow } from "./checklist";

export type KycProfileRow = KycValues & {
  id: string;
  broker_id: string;
  checklist: string[];
  status: "incomplete" | "submitted" | "approved";
};

export type BrokerOption = { id: string; name: string; market: Market };

const DOC_STAGES: Stage[] = ["documents_pending", "deposit_recorded", "deposit_verified"];
const select = "h-10 rounded-control border border-tl-line-strong bg-tl-surface px-3 text-body text-tl-text disabled:bg-tl-raised";

function BrokerPicker({ leadId, current, brokers, disabled }: { leadId: string; current: string | null; brokers: BrokerOption[]; disabled: boolean }) {
  const [state, action, pending] = useActionState(chooseBroker, null);
  useActionToast(state);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="leadId" value={leadId} />
      <label className="flex flex-col gap-1 text-label font-medium text-tl-text">
        Broker
        <select name="brokerId" defaultValue={current ?? ""} disabled={disabled} className={select}>
          <option value="" disabled>
            Choose the broker
          </option>
          {brokers.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({MARKETS.find((m) => m.value === b.market)?.label})
            </option>
          ))}
        </select>
      </label>
      {!disabled ? (
        <Button type="submit" variant="secondary" disabled={pending}>
          {current ? "Change broker" : "Start with this broker"}
        </Button>
      ) : null}
    </form>
  );
}

function KycForm({ profile, locked }: { profile: KycProfileRow; locked: boolean }) {
  const [state, action, pending] = useActionState(saveKycFields, null);
  useActionToast(state);
  const e = state?.fieldErrors ?? {};
  const yn = (v: boolean | null) => (v === true ? "yes" : v === false ? "no" : "");
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="profileId" value={profile.id} />
      <fieldset disabled={locked} className="grid gap-4 md:grid-cols-2">
        <Input label="CNIC number" name="cnic_number" defaultValue={profile.cnic_number ? formatCnic(profile.cnic_number) : ""} placeholder="35202-1234567-1" inputMode="numeric" error={e.cnic_number?.[0]} />
        <Input label="CNIC expiry" name="cnic_expiry" type="date" defaultValue={profile.cnic_expiry ?? ""} error={e.cnic_expiry?.[0]} />
        <Input label="Mother's name" name="mother_name" defaultValue={profile.mother_name ?? ""} error={e.mother_name?.[0]} />
        <Input label="Email" name="email" type="email" defaultValue={profile.email ?? ""} error={e.email?.[0]} />
        <Input label="Bank" name="bank_name" defaultValue={profile.bank_name ?? ""} error={e.bank_name?.[0]} />
        <Input label="IBAN" name="iban" defaultValue={profile.iban ? formatIban(profile.iban) : ""} placeholder="PK36 SCBL 0000 0011 2345 6702" error={e.iban?.[0]} />
        <label className="flex flex-col gap-1 text-label font-medium text-tl-text">
          Monthly income
          <select name="income_band" defaultValue={profile.income_band ?? ""} className={select}>
            <option value="">Choose</option>
            {INCOME_BANDS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-label font-medium text-tl-text">
          Risk level
          <select name="risk_level" defaultValue={profile.risk_level ?? ""} className={select}>
            <option value="">Choose</option>
            {RISK_LEVELS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-label font-medium text-tl-text">
          Politically exposed person
          <select name="is_pep" defaultValue={yn(profile.is_pep)} className={select}>
            <option value="">Choose</option>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </label>
        <div className="flex flex-col justify-end gap-3 md:col-span-2">
          <label className="flex items-center gap-3 text-body text-tl-text">
            <input type="hidden" name="sim_in_own_name" value="no" />
            <input type="checkbox" name="sim_in_own_name" value="yes" defaultChecked={profile.sim_in_own_name === true} className="size-4 accent-[var(--tl-primary)]" />
            The phone number&apos;s SIM is registered in the client&apos;s own name
          </label>
          <label className="flex items-center gap-3 text-body text-tl-text">
            <input type="checkbox" name="consent" defaultChecked={!!profile.consent_at} className="size-4 accent-[var(--tl-primary)]" />
            The client agreed to share these details with the broker
          </label>
        </div>
      </fieldset>
      {locked ? (
        <p className="text-small text-tl-muted">These details are approved and locked. An Admin can change them.</p>
      ) : (
        <div className="flex justify-end">
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "Saving" : "Save details"}
          </Button>
        </div>
      )}
    </form>
  );
}

/** The Documents tab: broker, checklist, KYC details, and the gate to record a deposit. */
export function DocumentsPanel({
  leadId,
  stage,
  profile,
  documents,
  brokers,
  canEdit,
  isAdmin,
  onRecordDeposit,
}: {
  leadId: string;
  stage: Stage;
  profile: KycProfileRow | null;
  documents: DocumentRow[];
  brokers: BrokerOption[];
  canEdit: boolean;
  isAdmin: boolean;
  onRecordDeposit: () => void;
}) {
  if (!profile && !DOC_STAGES.includes(stage)) {
    return (
      <EmptyState
        title="Documents start when the client agrees."
        body='When the client is ready to open an account, use "Start documents" to move the lead on.'
      />
    );
  }

  const items = profile?.checklist ?? [];
  const relevant = documents.filter((d) => items.includes(d.type));
  const collected = relevant.filter((d) => d.status === "collected" || d.status === "approved").length;
  const approved = relevant.filter((d) => d.status === "approved").length;
  const missing = profile ? missingFields(profile) : (Object.keys(KYC_FIELD_LABELS) as (keyof typeof KYC_FIELD_LABELS)[]);
  const filled = Object.keys(KYC_FIELD_LABELS).length - missing.length;
  const docsNeeded = items.length - collected;
  const complete = !!profile && docsNeeded === 0 && missing.length === 0;
  const anyApproved = relevant.some((d) => d.status === "approved");
  const total = Math.max(items.length, 1) + Object.keys(KYC_FIELD_LABELS).length;
  const pct = Math.round(((collected + filled) / total) * 100);

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-title font-semibold text-tl-text">KYC progress</h2>
            <p className="text-body text-tl-muted">
              {profile
                ? `${collected} of ${items.length} documents collected, ${approved} approved. ${filled} of ${Object.keys(KYC_FIELD_LABELS).length} details filled.`
                : "Choose the broker to see its checklist."}
            </p>
          </div>
          <Button
            onClick={onRecordDeposit}
            disabled={!complete}
            title={complete ? undefined : "Complete every document and detail first."}
          >
            <Wallet aria-hidden className="size-4" />
            Record a deposit
          </Button>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-tl-raised" role="progressbar" aria-label="KYC progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-tl-primary transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        {profile && !complete ? (
          <p className="text-small text-tl-muted">
            Still needed:{" "}
            {[
              docsNeeded > 0 ? `${docsNeeded} ${docsNeeded === 1 ? "document" : "documents"}` : null,
              ...missing.map((m) => KYC_FIELD_LABELS[m]),
            ]
              .filter(Boolean)
              .join(", ")}
            .
          </p>
        ) : null}
        <p className="text-small text-tl-muted">Documents are checked by the Admin in the broker&apos;s system. No copies are kept in the CRM.</p>
      </Card>

      <Card className="flex flex-col gap-4">
        <CardHeader className="mb-0" title="Broker and checklist" />
        <BrokerPicker leadId={leadId} current={profile?.broker_id ?? null} brokers={brokers} disabled={!canEdit || anyApproved} />
        {profile ? (
          <Checklist profileId={profile.id} checklist={items} documents={relevant} canEdit={canEdit} isAdmin={isAdmin} />
        ) : null}
      </Card>

      {profile ? (
        <Card>
          <CardHeader title="KYC details" description="Typed from the client's documents. Lists elsewhere show only the last 4 digits of the CNIC and IBAN." />
          <KycForm profile={profile} locked={!canEdit || (profile.status === "approved" && !isAdmin)} />
        </Card>
      ) : null}
    </div>
  );
}
