"use client";

import { Pencil, X } from "lucide-react";
import { useActionState, useState, type KeyboardEvent } from "react";
import { updateSetting } from "@/app/(app)/settings/actions";
import { PageHeader } from "@/components/features/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { formatKarachi } from "@/lib/format/dates";
import { formatPKR } from "@/lib/format/money";
import { useActionToast } from "@/lib/hooks/use-action-toast";
import { SETTING_GROUPS, SETTING_KEYS, SETTINGS, type SettingKey } from "@/lib/settings/definitions";

type Values = { [K in SettingKey]: number | string[] };
type Changed = Record<string, { at: string; by: string | null } | null>;

const GROUP_HELP: Record<string, string> = {
  "Calls and leads": "How fast leads must be worked, and when they move on.",
  Analysts: "Technical Analysis referrals.",
  Deposits: "How deposits are flagged and counted.",
  Security: "Sign-in safety for Admin and Superadmin.",
  Lists: "Choices people pick from in forms.",
};

function formatValue(key: SettingKey, value: number | string[]) {
  const def = SETTINGS[key];
  if (def.kind === "list") return null;
  const n = value as number;
  if (def.unit === "rupees") return formatPKR(n);
  const unit = n === 1 ? def.unit.replace(/s$/, "") : def.unit;
  return `${n.toLocaleString("en-US")} ${unit}`;
}

function Chips({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <li key={i} className="rounded-full border border-tl-line bg-tl-bg px-2.5 py-0.5 text-label text-tl-text-2">
          {i}
        </li>
      ))}
    </ul>
  );
}

function ListEditor({ initial, onChange, labelledBy }: { initial: string[]; onChange: (v: string[]) => void; labelledBy: string }) {
  const [items, setItems] = useState(initial);
  const [draft, setDraft] = useState("");
  const update = (next: string[]) => {
    setItems(next);
    onChange(next);
  };
  function add() {
    const v = draft.trim();
    if (!v) return;
    if (!items.some((i) => i.toLowerCase() === v.toLowerCase())) update([...items, v]);
    setDraft("");
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-wrap gap-1.5" aria-labelledby={labelledBy}>
        {items.map((i) => (
          <li
            key={i}
            className="inline-flex items-center gap-1 rounded-full border border-tl-line-strong bg-tl-surface py-0.5 pr-1 pl-2.5 text-label text-tl-text"
          >
            {i}
            <button
              type="button"
              aria-label={`Remove ${i}`}
              onClick={() => update(items.filter((x) => x !== i))}
              className="inline-flex size-5 items-center justify-center rounded-full text-tl-muted hover:bg-tl-raised hover:text-tl-text"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          placeholder="Add an item"
          aria-label="New item"
          className="h-9 w-64 rounded-control border border-tl-line-strong bg-tl-surface px-3 text-body text-tl-text placeholder:text-tl-muted"
        />
        <Button size="sm" variant="secondary" onClick={add} disabled={!draft.trim()}>
          Add
        </Button>
      </div>
    </div>
  );
}

function SettingRow({ settingKey, value, changed }: { settingKey: SettingKey; value: number | string[]; changed: Changed[string] }) {
  const def = SETTINGS[settingKey];
  const [editing, setEditing] = useState(false);
  const [list, setList] = useState<string[]>(def.kind === "list" ? (value as string[]) : []);
  const [state, action, pending] = useActionState(updateSetting, null);
  useActionToast(state, () => setEditing(false));
  const labelId = `setting-${settingKey}`;
  const error = state && !state.ok ? state.message : undefined;

  return (
    <li className="grid gap-3 border-b border-tl-line py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] md:items-start">
      <div className="flex flex-col gap-0.5">
        <span id={labelId} className="text-body font-semibold text-tl-text">
          {def.label}
        </span>
        <span className="text-small text-tl-muted">{def.help}</span>
      </div>

      {editing ? (
        <form action={action} className="flex flex-col gap-2 md:col-span-2" noValidate>
          <input type="hidden" name="key" value={settingKey} />
          {def.kind === "int" ? (
            <div className="flex items-center gap-2">
              <input
                name="value"
                defaultValue={String(value)}
                inputMode="numeric"
                aria-labelledby={labelId}
                aria-invalid={error ? true : undefined}
                autoFocus
                className="tl-amount h-9 w-40 rounded-control border border-tl-line-strong bg-tl-surface px-3 text-right text-body text-tl-text focus-visible:border-tl-primary aria-invalid:border-tl-danger"
              />
              <span className="text-label text-tl-muted">{def.unit}</span>
            </div>
          ) : (
            <>
              <input type="hidden" name="value" value={JSON.stringify(list)} />
              <ListEditor initial={value as string[]} onChange={setList} labelledBy={labelId} />
            </>
          )}
          {error ? <p className="text-small font-medium text-tl-danger">{error}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving" : "Save"}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            {def.kind === "list" ? (
              <Chips items={value as string[]} />
            ) : (
              <span className="tl-amount text-body font-semibold text-tl-text">{formatValue(settingKey, value)}</span>
            )}
            {JSON.stringify(value) === JSON.stringify(def.default) ? (
              <span className="text-small text-tl-muted">Default</span>
            ) : changed ? (
              <span className="text-small text-tl-muted">
                Changed {formatKarachi(changed.at, "date")}
                {changed.by ? ` by ${changed.by}` : ""}
              </span>
            ) : null}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (def.kind === "list") setList(value as string[]);
              setEditing(true);
            }}
            aria-label={`Edit ${def.label}`}
          >
            <Pencil aria-hidden className="size-3.5" />
            Edit
          </Button>
        </>
      )}
    </li>
  );
}

export function SettingsScreen({ values, changed }: { values: Values; changed: Changed }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="Rules the whole team works by. Every change is recorded in the audit log." />
      {SETTING_GROUPS.map((group) => (
        <Card key={group}>
          <CardHeader title={group} description={GROUP_HELP[group]} className="mb-1" />
          <ul>
            {SETTING_KEYS.filter((k) => SETTINGS[k].group === group).map((k) => (
              <SettingRow key={k} settingKey={k} value={values[k]} changed={changed[k] ?? null} />
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
