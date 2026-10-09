import type { Metadata } from "next";
import { ExportsScreen, type HistoryRow } from "@/components/features/exports/exports-screen";
import { NoAccess } from "@/components/features/shell/no-access";
import { requireAccess } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Exports" };

export default async function ExportsPage() {
  const ctx = await requireAccess("/exports");
  if (!ctx) return <NoAccess />;
  const supabase = await createClient();
  const [{ data: teams }, { data: history }] = await Promise.all([
    supabase.from("teams").select("id, name").eq("is_active", true).order("name"),
    supabase.from("export_history").select("id, created_at, kind, filters, row_count, includes_sensitive, who:profiles!export_history_user_id_fkey (full_name)").order("created_at", { ascending: false }).limit(50),
  ]);
  return (
    <ExportsScreen
      teams={(teams ?? []) as { id: string; name: string }[]}
      history={(history ?? []) as unknown as HistoryRow[]}
      canIncludeSensitive={ctx.profile.role === "superadmin"}
    />
  );
}
