"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { askAgent, rejectDeposit, reverseDeposit, verifyDeposit } from "@/app/(app)/deposits/actions";
import { PageHeader } from "@/components/features/shell/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { MoneyText } from "@/components/ui/money-text";
import { Sheet } from "@/components/ui/sheet";
import { Tabs } from "@/components/ui/tabs";
import { DEPOSIT_STATUS_LABEL, DEPOSIT_TYPE_LABEL, METHOD_LABEL, type DepositStatus, type DepositType } from "@/lib/deposits/rules";
import { formatKarachi, olderThanDays, timeAgo } from "@/lib/format/dates";
import { maskTail } from "@/lib/format/mask";
import type { ActionState } from "@/lib/forms";
import { useToastAction } from "@/lib/hooks/use-toast-action";
import { cn } from "@/lib/utils";

export type QueueDeposit = {
  id: string;
  lead_id: string;
  created_at: string;
  type: DepositType;
  amount_pkr: number;
  deposit_date: string;
  method: string;
  reference_no: string;
  cash_flag: boolean;
  status: DepositStatus;
  verified_at: string | null;
  reject_reason: string | null;
  reverse_reason: string | null;
  created_by: string;
  client_name: string;
  agent_name: string | null;
  team_name: string | null;
  kyc_status: string | null;
  kyc_bank: string | null;
  kyc_iban: string | null;
};

type Tab = "pending" | "verified" | "rejected";

const STATUS_STYLE: Record<DepositStatus, string> = {
  pending: "border-tl-wait/40 bg-tl-wait/10 text-tl-wait",
  verified: "border-tl-win/40 bg-tl-win/10 text-tl-win",
  rejected: "border-tl-danger/40 bg-tl-danger/10 text-tl-danger",
  reversed: "border-tl-line-strong bg-tl-raised text-tl-text-2",
};

/** A pending deposit waiting longer than this many days is shown in red. */
const REVIEW_DAYS = 1;

function Row({ name, value }: { name: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-tl-line py-2 last:border-b-0">
      <dt className="text-label text-tl-muted">{name}</dt>
      <dd className="text-right text-body text-tl-text">{value}</dd>
    </div>
  );
}

/** One short form: a hidden deposit id, a text box and a button. Toasts the result and closes on success. */
function TextForm({
  action,
  depositId,
  field,
  label,
  placeholder,
  button,
  variant,
  onDone,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  depositId: string;
  field: string;
  label: string;
  placeholder: string;
  button: string;
  variant: "secondary" | "danger";
  onDone: () => void;
}) {
  const id = useId();
  const [state, run, pending] = useToastAction(action, onDone);
  const error = state?.fieldErrors?.[field]?.[0];
  return (
    <form action={run} className="flex flex-col gap-2" noValidate>
      <input type="hidden" name="depositId" value={depositId} />
      <label htmlFor={id} className="text-label font-medium text-tl-text">
        {label}
      </label>
      <textarea
        id={id}
        name={field}
        rows={2}
        maxLength={300}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="rounded-control border border-tl-line-strong bg-tl-surface px-3 py-2 text-body text-tl-text placeholder:text-tl-muted aria-invalid:border-tl-danger"
      />
      {error ? (
        <p id={`${id}-error`} className="text-small font-medium text-tl-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? "Saving" : button}
      </Button>
    </form>
  );
}

function VerifyForm({ depositId, blocked, onDone }: { depositId: string; blocked: string | null; onDone: () => void }) {
  const id = useId();
  const [state, run, pending] = useToastAction(verifyDeposit, onDone);
  const [checked, setChecked] = useState(false);
  return (
    <form action={run} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="depositId" value={depositId} />
      <label htmlFor={id} className="flex items-start gap-3 text-body text-tl-text">
        <input
          id={id}
          type="checkbox"
          name="statementChecked"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          disabled={blocked !== null}
          className="mt-1 size-4 accent-[var(--tl-primary)]"
        />
        <span>The reference, amount, date and method match the bank or broker statement.</span>
      </label>
      {blocked ? <p className="text-small font-medium text-tl-danger">{blocked}</p> : null}
      {state && !state.ok && state.message ? <p className="text-small font-medium text-tl-danger">{state.message}</p> : null}
      <Button type="submit" disabled={pending || blocked !== null || !checked}>
        {pending ? "Verifying" : "Verify deposit"}
      </Button>
    </form>
  );
}

export function VerificationScreen({ deposits, viewerId }: { deposits: QueueDeposit[]; viewerId: string }) {
  const [tab, setTab] = useState<Tab>("pending");
  const [openId, setOpenId] = useState<string | null>(null);

  const groups = useMemo(() => {
    const pending = deposits.filter((d) => d.status === "pending").sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    const verified = deposits.filter((d) => d.status === "verified");
    const rejected = deposits.filter((d) => d.status === "rejected" || d.status === "reversed");
    return { pending, verified, rejected };
  }, [deposits]);
  const rows = groups[tab];
  const open = deposits.find((d) => d.id === openId) ?? null;
  const verifiedTotal = groups.verified.reduce((s, d) => s + Number(d.amount_pkr), 0);

  const blocked = open
    ? open.created_by === viewerId
      ? "You recorded this deposit, so another Admin must verify it."
      : open.kyc_status !== "approved"
        ? "The client's KYC is not approved yet. Approve it on the Document review screen first."
        : null
    : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Deposit verification"
        description="Match each reference number, amount and date against the bank or broker statement. Only verified deposits count anywhere in the CRM."
      />
      <Tabs
        idPrefix="deposits"
        label="Deposit queue"
        value={tab}
        onChange={setTab}
        items={[
          { value: "pending", label: "Pending", count: groups.pending.length },
          { value: "verified", label: "Verified", count: groups.verified.length },
          { value: "rejected", label: "Rejected", count: groups.rejected.length },
        ]}
      />
      {tab === "verified" && groups.verified.length > 0 ? (
        <p className="text-body text-tl-muted">
          Verified total in this list: <MoneyText amount={verifiedTotal} verified className="text-body font-semibold" />
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title={tab === "pending" ? "Nothing waiting." : tab === "verified" ? "No verified deposits yet." : "Nothing rejected or reversed."}
          body={tab === "pending" ? "Deposits appear here when an agent records one." : "They will show here."}
        />
      ) : (
        <div className="overflow-x-auto rounded-card border border-tl-line bg-tl-surface shadow-card">
          <table className="w-full min-w-[900px] text-left">
            <caption className="sr-only">{tab} deposits</caption>
            <thead className="bg-tl-bg">
              <tr>
                {["Amount", "Client", "Agent and team", "Reference", "Method", tab === "pending" ? "Waiting" : "Status", ""].map((h, i) => (
                  <th key={i} scope="col" className="border-b border-tl-line px-4 py-2.5 text-label font-semibold text-tl-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="border-t border-tl-line first:border-t-0 hover:bg-tl-bg">
                  <td className="px-4 py-3">
                    <MoneyText amount={Number(d.amount_pkr)} verified={d.status === "verified"} className="text-body font-semibold" />
                    <span className="block text-small text-tl-muted">{DEPOSIT_TYPE_LABEL[d.type]}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/lead/${d.lead_id}`} className="text-body font-semibold text-tl-text hover:text-tl-link hover:underline">
                      {d.client_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-body text-tl-text-2">
                    {d.agent_name ?? "Nobody"}
                    <span className="block text-small text-tl-muted">{d.team_name ?? "No team"}</span>
                  </td>
                  <td className="tl-amount px-4 py-3 text-body text-tl-text-2">{d.reference_no}</td>
                  <td className="px-4 py-3 text-body text-tl-text-2">
                    {METHOD_LABEL[d.method] ?? d.method}
                    {d.cash_flag ? <span className="block text-small font-semibold text-tl-wait">Cash above limit</span> : null}
                  </td>
                  <td className="px-4 py-3">
                    {tab === "pending" ? (
                      <span className={cn("text-body", olderThanDays(d.created_at, REVIEW_DAYS) ? "font-semibold text-tl-danger" : "text-tl-muted")}>
                        {timeAgo(d.created_at)}
                      </span>
                    ) : (
                      <span className={cn("inline-block rounded-full border px-2.5 py-0.5 text-small font-semibold", STATUS_STYLE[d.status])}>
                        {DEPOSIT_STATUS_LABEL[d.status]}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant={d.status === "pending" ? "primary" : "secondary"}
                      onClick={() => setOpenId(d.id)}
                      aria-label={`${d.status === "pending" ? "Review" : "Open"} deposit ${d.reference_no}`}
                    >
                      {d.status === "pending" ? "Review" : "Open"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Sheet
        open={open !== null}
        onClose={() => setOpenId(null)}
        title={open ? `Deposit ${open.reference_no}` : ""}
        description={open ? `${open.client_name}, ${open.agent_name ?? "no agent"}` : undefined}
      >
        {open ? (
          <div className="flex flex-col gap-6">
            <section aria-label="Deposit details" className="flex flex-col gap-2">
              <h3 className="text-title font-semibold text-tl-text">Check against the statement</h3>
              <dl>
                <Row name="Amount" value={<MoneyText amount={Number(open.amount_pkr)} verified={open.status === "verified"} className="text-body font-semibold" />} />
                <Row name="Reference" value={<span className="tl-amount">{open.reference_no}</span>} />
                <Row name="Date" value={formatKarachi(`${open.deposit_date}T12:00:00Z`, "date")} />
                <Row name="Method" value={METHOD_LABEL[open.method] ?? open.method} />
                <Row name="Type" value={DEPOSIT_TYPE_LABEL[open.type]} />
                <Row name="Recorded" value={timeAgo(open.created_at)} />
                <Row name="Client" value={open.client_name} />
                <Row name="Client's bank" value={open.kyc_bank ? `${open.kyc_bank}${open.kyc_iban ? `, ${maskTail(open.kyc_iban)}` : ""}` : "Not given"} />
                <Row
                  name="KYC"
                  value={
                    <span className={open.kyc_status === "approved" ? "font-semibold text-tl-win" : "font-semibold text-tl-danger"}>
                      {open.kyc_status === "approved" ? "Approved" : open.kyc_status === "submitted" ? "Waiting for review" : "Incomplete"}
                    </span>
                  }
                />
              </dl>
              {open.cash_flag ? (
                <p className="rounded-control border border-tl-wait/40 bg-tl-wait/10 px-3 py-2 text-body text-tl-wait">
                  Cash above the limit. Ask for the receipt before verifying.
                </p>
              ) : null}
              {open.status === "rejected" && open.reject_reason ? <p className="text-body font-medium text-tl-danger">Rejected: {open.reject_reason}</p> : null}
              {open.status === "reversed" && open.reverse_reason ? <p className="text-body text-tl-muted">Reversed: {open.reverse_reason}</p> : null}
            </section>

            {open.status === "pending" ? (
              <>
                <VerifyForm key={open.id} depositId={open.id} blocked={blocked} onDone={() => setOpenId(null)} />
                <hr className="border-tl-line" />
                <TextForm
                  action={askAgent}
                  depositId={open.id}
                  field="question"
                  label="Ask the agent"
                  placeholder="What do you need to know before deciding?"
                  button="Send question"
                  variant="secondary"
                  onDone={() => setOpenId(null)}
                />
                <TextForm
                  action={rejectDeposit}
                  depositId={open.id}
                  field="reason"
                  label="Reject with a reason"
                  placeholder="What does the agent need to fix?"
                  button="Reject deposit"
                  variant="danger"
                  onDone={() => setOpenId(null)}
                />
              </>
            ) : null}
            {open.status === "verified" ? (
              <TextForm
                action={reverseDeposit}
                depositId={open.id}
                field="reason"
                label="Reverse this deposit"
                placeholder="Why is it being reversed? For example, the client withdrew the money."
                button="Reverse deposit"
                variant="danger"
                onDone={() => setOpenId(null)}
              />
            ) : null}
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
