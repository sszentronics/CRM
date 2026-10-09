"use client";

import { AlertTriangle } from "lucide-react";
import { useId, useState } from "react";
import { recordDeposit } from "@/app/(app)/deposits/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { DEPOSIT_METHODS, isCashFlagged, type DepositMethod } from "@/lib/deposits/rules";
import { formatPKR } from "@/lib/format/money";
import { useToastAction } from "@/lib/hooks/use-toast-action";

/** Record money received from a client. The Admin checks it against the bank or broker statement. */
export function DepositSheet({
  lead,
  brokerName,
  analystName,
  isTopUp,
  cashLimit,
  today,
  open,
  onClose,
}: {
  lead: { id: string; full_name: string };
  brokerName: string;
  analystName: string | null;
  isTopUp: boolean;
  cashLimit: number;
  today: string;
  open: boolean;
  onClose: () => void;
}) {
  const formId = useId();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<DepositMethod>("bank_transfer");
  const [reference, setReference] = useState("");
  const [state, action, pending] = useToastAction(recordDeposit, onClose);
  const digits = Number(amount.replace(/[^0-9]/g, "")) || 0;
  const flagged = isCashFlagged(method, digits, cashLimit);
  const err = (k: string) => state?.fieldErrors?.[k]?.[0];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      dirty={amount.length > 0 || reference.length > 0}
      title={isTopUp ? "Record a top-up" : "Record a deposit"}
      description={`${lead.full_name}. An Admin who did not record it checks the reference against the statement.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={pending}>
            {pending ? "Recording" : "Record deposit"}
          </Button>
        </>
      }
    >
      <form id={formId} action={action} className="flex flex-col gap-5" noValidate>
        <input type="hidden" name="leadId" value={lead.id} />

        <dl className="grid grid-cols-2 gap-4 rounded-control border border-tl-line bg-tl-bg p-4">
          <div>
            <dt className="text-small text-tl-muted">Broker</dt>
            <dd className="text-body font-semibold text-tl-text">{brokerName}</dd>
          </div>
          <div>
            <dt className="text-small text-tl-muted">Type</dt>
            <dd className="text-body font-semibold text-tl-text">{isTopUp ? "Top-up" : "First deposit"}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-small text-tl-muted">Analyst credited</dt>
            <dd className="text-body font-semibold text-tl-text">{analystName ?? "None. No analyst saw this client."}</dd>
          </div>
        </dl>

        <Input
          label="Amount (Rs)"
          name="amount"
          inputMode="numeric"
          autoComplete="off"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9,]/g, ""))}
          error={err("amount")}
          hint={digits > 0 ? formatPKR(digits) : "Whole rupees."}
        />
        <Input label="Deposit date" name="date" type="date" defaultValue={today} max={today} error={err("date")} />
        <Select
          label="How it was paid"
          name="method"
          value={method}
          onChange={(e) => setMethod(e.target.value as DepositMethod)}
          options={DEPOSIT_METHODS.map((m) => ({ value: m.value, label: m.label }))}
          error={err("method")}
        />
        {flagged ? (
          <p role="status" className="flex items-start gap-2 rounded-control border border-tl-wait/40 bg-tl-wait/10 px-3 py-2.5 text-body text-tl-wait">
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>Cash above {formatPKR(cashLimit)} is flagged for the Admin. Keep the receipt.</span>
          </p>
        ) : null}
        <Input
          label="Bank or transaction reference"
          name="reference"
          autoComplete="off"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          error={err("reference")}
          hint="As it appears on the bank or broker statement. Each reference can be used once."
        />
      </form>
    </Sheet>
  );
}
