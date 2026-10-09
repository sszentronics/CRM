"use client";

import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MoneyText } from "@/components/ui/money-text";
import { DEPOSIT_STATUS_LABEL, DEPOSIT_TYPE_LABEL, METHOD_LABEL, type DepositStatus, type DepositType } from "@/lib/deposits/rules";
import { formatKarachi } from "@/lib/format/dates";
import type { Stage } from "@/lib/leads/stages";
import { cn } from "@/lib/utils";

export type DepositRow = {
  id: string;
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
};

const STATUS_STYLE: Record<DepositStatus, string> = {
  pending: "border-tl-wait/40 bg-tl-wait/10 text-tl-wait",
  verified: "border-tl-win/40 bg-tl-win/10 text-tl-win",
  rejected: "border-tl-danger/40 bg-tl-danger/10 text-tl-danger",
  reversed: "border-tl-line-strong bg-tl-raised text-tl-text-2",
};

const RECORD_STAGES: Stage[] = ["documents_pending", "deposit_recorded", "deposit_verified"];

/** The Deposits tab: the verified total, every deposit with its status, and the button to record one. */
export function DepositsPanel({
  deposits,
  stage,
  kycReady,
  canRecord,
  onRecord,
}: {
  deposits: DepositRow[];
  stage: Stage;
  kycReady: boolean;
  canRecord: boolean;
  onRecord: () => void;
}) {
  const verified = deposits.filter((d) => d.status === "verified");
  const total = verified.reduce((sum, d) => sum + Number(d.amount_pkr), 0);
  const pending = deposits.filter((d) => d.status === "pending").length;
  const stageOk = RECORD_STAGES.includes(stage);
  const may = canRecord && stageOk && kycReady;
  const why = !stageOk
    ? "A deposit is recorded once the client is in documents."
    : "Complete every document and detail on the Documents tab first.";

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-title font-semibold text-tl-text">Verified total</h2>
          <MoneyText amount={total} verified className="text-display-m" />
          <p className="text-body text-tl-muted">
            {verified.length} verified {verified.length === 1 ? "deposit" : "deposits"}
            {pending > 0 ? `, ${pending} waiting for an Admin` : ""}. Only verified deposits count.
          </p>
        </div>
        {canRecord ? (
          <Button onClick={onRecord} disabled={!may} title={may ? undefined : why}>
            <Wallet aria-hidden className="size-4" />
            {deposits.some((d) => d.status === "pending" || d.status === "verified") ? "Record a top-up" : "Record a deposit"}
          </Button>
        ) : null}
      </Card>

      {deposits.length === 0 ? (
        <EmptyState title="No deposits yet." body="When the client pays, record the reference here and an Admin checks it against the statement." />
      ) : (
        <div className="overflow-x-auto rounded-card border border-tl-line bg-tl-surface shadow-card">
          <table className="w-full min-w-[640px] text-left">
            <caption className="sr-only">Deposits</caption>
            <thead className="bg-tl-bg">
              <tr>
                {["Amount", "Type", "Method", "Reference", "Date", "Status"].map((h) => (
                  <th key={h} scope="col" className="border-b border-tl-line px-4 py-2.5 text-label font-semibold text-tl-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {deposits.map((d) => (
                <tr key={d.id} className="border-t border-tl-line align-top first:border-t-0">
                  <td className="px-4 py-3">
                    <MoneyText amount={Number(d.amount_pkr)} verified={d.status === "verified"} className="text-body font-semibold" />
                    {d.cash_flag ? <span className="block text-small font-semibold text-tl-wait">Cash above limit</span> : null}
                  </td>
                  <td className="px-4 py-3 text-body text-tl-text-2">{DEPOSIT_TYPE_LABEL[d.type]}</td>
                  <td className="px-4 py-3 text-body text-tl-text-2">{METHOD_LABEL[d.method] ?? d.method}</td>
                  <td className="tl-amount px-4 py-3 text-body text-tl-text-2">{d.reference_no}</td>
                  <td className="px-4 py-3 text-body text-tl-text-2">{formatKarachi(`${d.deposit_date}T12:00:00Z`, "date")}</td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-block rounded-full border px-2.5 py-0.5 text-small font-semibold", STATUS_STYLE[d.status])}>
                      {DEPOSIT_STATUS_LABEL[d.status]}
                    </span>
                    {d.status === "rejected" && d.reject_reason ? (
                      <span className="mt-1 block text-small font-medium text-tl-danger">Rejected: {d.reject_reason}</span>
                    ) : null}
                    {d.status === "reversed" && d.reverse_reason ? (
                      <span className="mt-1 block text-small text-tl-muted">Reversed: {d.reverse_reason}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
