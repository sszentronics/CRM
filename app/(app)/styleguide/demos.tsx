"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { MoneyText } from "@/components/ui/money-text";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { formatPKR } from "@/lib/format/money";
import { PHONE_HELP } from "@/lib/format/phone";

export function SheetDemo() {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open drawer
      </Button>
      <Sheet
        open={open}
        title="Log a call"
        description="Type something, then close: the drawer asks first."
        dirty={note.length > 0}
        onClose={() => {
          setOpen(false);
          setNote("");
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setOpen(false);
                setNote("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setOpen(false);
                setNote("");
              }}
            >
              Save call
            </Button>
          </>
        }
      >
        <Input label="Notes" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened?" />
      </Sheet>
    </>
  );
}

export function ToastDemo() {
  const toast = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={() => toast("Call saved. Next follow-up tomorrow at 3:00 pm.")}>
        Success toast
      </Button>
      <Button
        variant="danger"
        onClick={() => toast("CNIC front rejected: blurry. Retake it and upload again.", "error")}
      >
        Error toast
      </Button>
    </div>
  );
}

export function CountUpDemo() {
  const [amount, setAmount] = useState(4_250_000);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <MoneyText amount={amount} verified countUp className="text-display-l" />
      <Button variant="secondary" onClick={() => setAmount((a) => a + 250_000)}>
        Add Rs 250,000
      </Button>
    </div>
  );
}

export function FormDemo() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Input label="Full name" placeholder="As on CNIC" />
      <Input
        label="Phone"
        defaultValue="12345"
        inputMode="tel"
        error={PHONE_HELP}
      />
      <Select
        label="Source"
        placeholder="Choose a source"
        options={["Facebook", "Instagram", "TikTok", "PR", "Referral", "Walk-in"].map((s) => ({ value: s, label: s }))}
      />
      <Input label="Next follow-up" type="datetime-local" hint="Shown in Karachi time." />
    </div>
  );
}

type AgentRow = { id: string; name: string; team: string; calls: number; verified: number };

const AGENTS: AgentRow[] = [
  { id: "1", name: "Bilal R.", team: "Falcons", calls: 42, verified: 1_200_000 },
  { id: "2", name: "Sana T.", team: "Markhors", calls: 38, verified: 1_100_000 },
  { id: "3", name: "Hira M.", team: "Shaheens", calls: 51, verified: 940_000 },
  { id: "4", name: "Usman A.", team: "Leopards", calls: 29, verified: 700_000 },
];

const COLUMNS: Column<AgentRow>[] = [
  { key: "name", header: "Agent", cell: (r) => r.name, sortValue: (r) => r.name, primary: true },
  { key: "team", header: "Team", cell: (r) => r.team, sortValue: (r) => r.team },
  { key: "calls", header: "Calls", cell: (r) => r.calls, sortValue: (r) => r.calls, align: "right" },
  {
    key: "verified",
    header: "Verified",
    cell: (r) => <span className="tl-amount text-tl-win">{formatPKR(r.verified)}</span>,
    sortValue: (r) => r.verified,
    align: "right",
  },
];

export function TableDemo() {
  return <DataTable rows={AGENTS} columns={COLUMNS} rowKey={(r) => r.id} caption="Agents this month" noun="agents" />;
}
