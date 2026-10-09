import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/features/shell/no-access";
import { PageHeader } from "@/components/features/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StageChip } from "@/components/ui/stage-chip";
import { requireAccess } from "@/lib/auth/session";
import { formatPhone } from "@/lib/format/phone";
import { searchLeads } from "./actions";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  if (!(await requireAccess("/search"))) return <NoAccess />;
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const result = await searchLeads(q, 50);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Search" description={q ? `Results for "${q}"` : "Search leads by name or phone from the box at the top."} />
      {result.tooShort ? (
        <EmptyState title="Type at least 3 characters." body="Search by part of a name, or by a phone number." />
      ) : result.hits.length > 0 ? (
        <ul className="overflow-hidden rounded-card border border-tl-line bg-tl-surface shadow-card" aria-label="Matching leads">
          {result.hits.map((h) => (
            <li key={h.id} className="border-b border-tl-line last:border-b-0">
              <Link href={`/lead/${h.id}`} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-tl-bg">
                <span className="flex flex-col">
                  <span className="text-body font-semibold text-tl-text">{h.full_name}</span>
                  <span className="tl-amount text-small text-tl-muted">{formatPhone(h.phone)}</span>
                </span>
                <StageChip stage={h.stage} />
              </Link>
            </li>
          ))}
        </ul>
      ) : result.elsewhere ? (
        <EmptyState title="Already in the system." body="This number belongs to a lead you cannot open. Ask your Team Lead if you need it." />
      ) : (
        <EmptyState title="No leads match." body="Check the spelling, or search by phone number instead." />
      )}
    </div>
  );
}
