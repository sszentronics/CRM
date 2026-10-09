"use client";

import { Plus } from "lucide-react";
import { useActionState, useId, useState, useTransition } from "react";
import { saveBroker, setBrokerActive } from "@/app/(app)/brokers/actions";
import { PageHeader } from "@/components/features/shell/page-header";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import {
  DEFAULT_CHECKLIST,
  DOCUMENT_TYPES,
  documentLabel,
  MARKETS,
  type Market,
} from "@/lib/brokers/documents";
import { formatKarachi } from "@/lib/format/dates";
import { useActionToast } from "@/lib/hooks/use-action-toast";

export type BrokerRow = {
  id: string;
  name: string;
  market: Market;
  kyc_checklist: string[];
  is_active: boolean;
  updated_at: string;
};

const marketLabel = (m: Market) => MARKETS.find((x) => x.value === m)?.label ?? m;

function MarketBadge({ market }: { market: Market }) {
  return (
    <span className="inline-flex h-6 items-center rounded-full border border-tl-line bg-tl-raised px-2.5 text-small font-semibold text-tl-text-2">
      {marketLabel(market)}
    </span>
  );
}

function ActiveSwitch({ broker }: { broker: BrokerRow }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      <Switch
        checked={broker.is_active}
        disabled={pending}
        aria-label={`${broker.name} is ${broker.is_active ? "on" : "off"}`}
        onClick={() =>
          start(async () => {
            const fd = new FormData();
            fd.set("id", broker.id);
            fd.set("active", String(!broker.is_active));
            const r = await setBrokerActive(null, fd);
            if (r?.message) toast(r.message, r.ok ? "success" : "error");
          })
        }
      />
      <span className="text-label text-tl-text-2">{broker.is_active ? "On" : "Off"}</span>
    </span>
  );
}

function BrokerDrawer({ broker, open, onClose }: { broker: BrokerRow | null; open: boolean; onClose: () => void }) {
  const editing = broker !== null;
  const formId = useId();
  const [state, action, pending] = useActionState(saveBroker, null);
  const [dirty, setDirty] = useState(false);
  const close = () => {
    setDirty(false);
    onClose();
  };
  useActionToast(state, close);
  const errors = state?.fieldErrors ?? {};
  const checked = new Set(broker?.kyc_checklist ?? DEFAULT_CHECKLIST);

  return (
    <Sheet
      open={open}
      onClose={close}
      dirty={dirty}
      title={editing ? `Edit ${broker.name}` : "Add a broker"}
      description={editing ? "Checklist changes apply to new clients only." : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={pending}>
            {pending ? "Saving" : editing ? "Save broker" : "Add broker"}
          </Button>
        </>
      }
    >
      <form id={formId} action={action} onChange={() => setDirty(true)} className="flex flex-col gap-5" noValidate>
        {editing ? <input type="hidden" name="id" value={broker.id} /> : null}
        <Input label="Broker name" name="name" defaultValue={broker?.name} error={errors.name?.[0]} />

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-label font-medium text-tl-text">Market</legend>
          <div className="grid grid-cols-3 gap-2">
            {MARKETS.map((m) => (
              <label
                key={m.value}
                className="flex cursor-pointer flex-col rounded-control border border-tl-line-strong px-3 py-2 has-[:checked]:border-tl-primary has-[:checked]:bg-tl-primary-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-tl-focus"
              >
                <input
                  type="radio"
                  name="market"
                  value={m.value}
                  defaultChecked={broker?.market === m.value}
                  className="sr-only"
                />
                <span className="text-body font-semibold text-tl-text">{m.label}</span>
                <span className="text-small text-tl-muted">{m.long}</span>
              </label>
            ))}
          </div>
          {errors.market ? <p className="text-small font-medium text-tl-danger">{errors.market[0]}</p> : null}
        </fieldset>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-0.5 text-label font-medium text-tl-text">KYC checklist</legend>
          <p className="mb-1.5 text-small text-tl-muted">Documents a client of this broker must upload.</p>
          <div className="flex flex-col divide-y divide-tl-line rounded-control border border-tl-line">
            {DOCUMENT_TYPES.map((d) => (
              <label key={d.key} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-tl-bg">
                <input
                  type="checkbox"
                  name="checklist"
                  value={d.key}
                  defaultChecked={checked.has(d.key)}
                  className="size-4 accent-[var(--tl-primary)]"
                />
                <span className="text-body text-tl-text">{d.label}</span>
              </label>
            ))}
          </div>
          {errors.checklist ? <p className="text-small font-medium text-tl-danger">{errors.checklist[0]}</p> : null}
        </fieldset>
      </form>
    </Sheet>
  );
}

export function BrokersScreen({ brokers }: { brokers: BrokerRow[] }) {
  const [drawer, setDrawer] = useState<{ broker: BrokerRow | null } | null>(null);

  const columns: Column<BrokerRow>[] = [
    {
      key: "name",
      header: "Broker",
      primary: true,
      sortValue: (b) => b.name.toLowerCase(),
      cell: (b) => <span className="font-semibold text-tl-text">{b.name}</span>,
    },
    { key: "market", header: "Market", sortValue: (b) => b.market, cell: (b) => <MarketBadge market={b.market} /> },
    {
      key: "checklist",
      header: "KYC checklist",
      sortValue: (b) => b.kyc_checklist.length,
      cell: (b) => (
        <span title={b.kyc_checklist.map(documentLabel).join("\n")}>
          {b.kyc_checklist.length} {b.kyc_checklist.length === 1 ? "document" : "documents"}
        </span>
      ),
    },
    {
      key: "updated",
      header: "Last changed",
      sortValue: (b) => b.updated_at,
      cell: (b) => <span className="text-tl-muted">{formatKarachi(b.updated_at, "date")}</span>,
    },
    { key: "status", header: "Status", sortValue: (b) => (b.is_active ? 0 : 1), cell: (b) => <ActiveSwitch broker={b} /> },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: (b) => (
        <Button size="sm" variant="ghost" onClick={() => setDrawer({ broker: b })} aria-label={`Edit ${b.name}`}>
          Edit
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Brokers"
        description="The brokers Trading Labs places clients with, and the documents each one needs."
        actions={
          <Button onClick={() => setDrawer({ broker: null })}>
            <Plus aria-hidden className="size-4" />
            Add broker
          </Button>
        }
      />
      {brokers.length > 0 ? (
        <DataTable rows={brokers} columns={columns} rowKey={(b) => b.id} caption="Brokers" noun="brokers" />
      ) : (
        <EmptyState
          title="No brokers yet."
          body="Add the PSX and PMEX brokers you work with. Agents choose one when they collect documents."
          action={<Button onClick={() => setDrawer({ broker: null })}>Add broker</Button>}
        />
      )}
      <BrokerDrawer
        key={drawer ? (drawer.broker?.id ?? "new") : "closed"}
        broker={drawer?.broker ?? null}
        open={drawer !== null}
        onClose={() => setDrawer(null)}
      />
    </div>
  );
}
