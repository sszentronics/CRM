import type { Metadata } from "next";
import { ArenaScreen } from "@/components/features/arena/arena-screen";
import { requireAccess } from "@/lib/auth/session";
import { loadArena } from "@/lib/boards/load";
import { createClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace/get";
import { themeCss } from "@/lib/workspace/theme";

export const metadata: Metadata = { title: "The Arena" };

export default async function ArenaPage({ searchParams }: PageProps<"/arena">) {
  const ctx = await requireAccess("/arena");
  if (!ctx) return <p className="p-8 text-white">You do not have access to this page.</p>;
  const { tv } = await searchParams;
  const supabase = await createClient();
  const initial = await loadArena(supabase, "month", { id: ctx.userId, role: ctx.profile.role });
  const workspace = await getWorkspace();
  const css = workspace?.plan === "client" ? themeCss(workspace.theme) : "";
  return (
    <>
      {css ? <style>{css}</style> : null}
      <ArenaScreen
        initial={initial}
        role={ctx.profile.role}
        tv={tv === "1"}
        brand={{ name: workspace?.name ?? "QuantraPro", logoPath: workspace?.logoPath ?? null }}
      />
    </>
  );
}
