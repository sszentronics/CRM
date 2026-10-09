import { EmptyState } from "@/components/ui/empty-state";
import { requireAccess } from "@/lib/auth/session";
import { NoAccess } from "./no-access";
import { PageHeader } from "./page-header";

/** Stand-in for a screen whose module has not been built yet. Still enforces who may open it. */
export async function PlaceholderPage({ title, module, path }: { title: string; module: number; path: string }) {
  const ctx = await requireAccess(path);
  if (!ctx) return <NoAccess />;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} />
      <EmptyState title="This screen is on its way." body={`It is built in Module ${module} of the plan.`} />
    </div>
  );
}
