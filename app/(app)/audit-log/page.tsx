import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/features/shell/page-header";
import { NoAccess } from "@/components/features/shell/no-access";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAccess } from "@/lib/auth/session";
import { formatKarachi } from "@/lib/format/dates";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Audit log" };

const PAGE = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

type Row = {
  id: string;
  created_at: string;
  action: string;
  entity: string;
  entity_id: string | null;
  meta: Record<string, unknown>;
  ip: string | null;
  who: { full_name: string } | null;
};

/** Short, readable details. Long values are cut so the table stays tidy; nothing here can be edited. */
function details(meta: Record<string, unknown>) {
  const text = Object.entries(meta)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(", ");
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

export default async function AuditLogPage({ searchParams }: PageProps<"/audit-log">) {
  if (!(await requireAccess("/audit-log"))) return <NoAccess />;
  const sp = (await searchParams) as Raw;
  const user = UUID.test(one(sp.user)) ? one(sp.user) : "";
  const action = /^[a-z_.]{1,60}$/.test(one(sp.action)) ? one(sp.action) : "";
  const from = DATE.test(one(sp.from)) ? one(sp.from) : "";
  const to = DATE.test(one(sp.to)) ? one(sp.to) : "";
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const supabase = await createClient();
  let query = supabase
    .from("audit_log")
    .select("id, created_at, action, entity, entity_id, meta, ip, who:profiles!audit_log_user_id_fkey (full_name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (user) query = query.eq("user_id", user);
  if (action) query = query.eq("action", action);
  if (from) query = query.gte("created_at", `${from}T00:00:00+05:00`);
  if (to) query = query.lt("created_at", new Date(new Date(`${to}T00:00:00+05:00`).getTime() + 86_400_000).toISOString());

  const [{ data, count }, { data: actions }, { data: people }] = await Promise.all([
    query,
    supabase.rpc("audit_actions"),
    supabase.from("profiles").select("id, full_name").order("full_name").limit(500),
  ]);
  const rows = (data ?? []) as unknown as Row[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const q = (p: number) => {
    const s = new URLSearchParams();
    if (user) s.set("user", user);
    if (action) s.set("action", action);
    if (from) s.set("from", from);
    if (to) s.set("to", to);
    s.set("page", String(p));
    return `/audit-log?${s.toString()}`;
  };
  const control = "h-10 rounded-control border border-tl-line-strong bg-tl-surface px-3 text-body text-tl-text";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Audit log" description="Who did what, and when. Entries can be read here and nowhere changed or deleted." />

      <form method="get" action="/audit-log" aria-label="Audit log filters" className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-label font-medium text-tl-text">
          User
          <select name="user" defaultValue={user} className={control}>
            <option value="">Everyone</option>
            {((people ?? []) as { id: string; full_name: string }[]).map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-label font-medium text-tl-text">
          Action
          <select name="action" defaultValue={action} className={control}>
            <option value="">Every action</option>
            {((actions ?? []) as { action: string }[]).map((a) => (
              <option key={a.action} value={a.action}>
                {a.action}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-label font-medium text-tl-text">
          From
          <input type="date" name="from" defaultValue={from} className={control} />
        </label>
        <label className="flex flex-col gap-1 text-label font-medium text-tl-text">
          To
          <input type="date" name="to" defaultValue={to} className={control} />
        </label>
        <button type="submit" className="h-10 rounded-control bg-tl-primary px-4 text-body font-semibold text-white hover:bg-tl-primary-hover">
          Apply filters
        </button>
        <Link href="/audit-log" className="inline-flex h-10 items-center text-label font-semibold text-tl-link hover:underline">
          Clear
        </Link>
      </form>

      {rows.length === 0 ? (
        <EmptyState title="No entries match." body="Try another user or action, or clear the filters." />
      ) : (
        <>
          <p className="text-small text-tl-muted">
            {total} {total === 1 ? "entry" : "entries"}, newest first. Page {page} of {pages}.
          </p>
          <div className="overflow-x-auto rounded-card border border-tl-line bg-tl-surface shadow-card">
            <table className="w-full min-w-[900px] text-left">
              <caption className="sr-only">Audit log entries</caption>
              <thead className="bg-tl-bg">
                <tr>
                  {["When", "User", "Action", "What", "Details", "IP"].map((h) => (
                    <th key={h} scope="col" className="border-b border-tl-line px-4 py-2.5 text-label font-semibold text-tl-muted">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-tl-line align-top first:border-t-0">
                    <td className="whitespace-nowrap px-4 py-2.5 text-body text-tl-text-2">{formatKarachi(r.created_at)}</td>
                    <td className="px-4 py-2.5 text-body text-tl-text-2">{r.who?.full_name ?? "System"}</td>
                    <td className="px-4 py-2.5 text-body font-semibold text-tl-text">{r.action}</td>
                    <td className="px-4 py-2.5 text-body text-tl-text-2">
                      {r.entity}
                      {r.entity_id ? <span className="block max-w-[180px] truncate text-small text-tl-muted">{r.entity_id}</span> : null}
                    </td>
                    <td className="max-w-[320px] px-4 py-2.5 text-small text-tl-muted">{details(r.meta)}</td>
                    <td className="tl-amount px-4 py-2.5 text-small text-tl-muted">{r.ip ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav aria-label="Pages" className="flex items-center justify-between">
            {page > 1 ? (
              <Link href={q(page - 1)} className="text-label font-semibold text-tl-link hover:underline">
                Newer
              </Link>
            ) : (
              <span />
            )}
            {page < pages ? (
              <Link href={q(page + 1)} className="text-label font-semibold text-tl-link hover:underline">
                Older
              </Link>
            ) : null}
          </nav>
        </>
      )}
    </div>
  );
}
