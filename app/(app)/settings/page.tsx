import type { Metadata } from "next";
import { SettingsScreen } from "@/components/features/settings/settings-screen";
import { NoAccess } from "@/components/features/shell/no-access";
import { requireAccess } from "@/lib/auth/session";
import { getAllSettings } from "@/lib/settings/get-setting";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  if (!(await requireAccess("/settings"))) return <NoAccess />;
  const supabase = await createClient();
  const [values, { data: meta }] = await Promise.all([
    getAllSettings(supabase),
    supabase.from("settings").select("key, updated_at, updated_by, profiles:updated_by (full_name)"),
  ]);
  const changed = Object.fromEntries(
    (meta ?? []).map((r) => [
      r.key,
      r.updated_by
        ? { at: r.updated_at as string, by: (r.profiles as unknown as { full_name: string } | null)?.full_name ?? null }
        : null,
    ]),
  );
  return <SettingsScreen values={values} changed={changed} />;
}
