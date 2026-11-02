import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseTheme, type WorkspaceTheme } from "./theme";

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

/** What anyone may see before signing in: the name, logo and colours of one company. Nothing else leaves the database. */
export type PublicBrand = { slug: string; name: string; logoPath: string | null; theme: WorkspaceTheme | null };

/** Looks up a company by its address. Colours are only returned for client workspaces. */
export async function getPublicBrand(slug: string): Promise<PublicBrand | null> {
  if (!SLUG_PATTERN.test(slug)) return null;
  const { data } = await createAdminClient()
    .from("workspaces")
    .select("slug, name, plan, theme, logo_path")
    .eq("slug", slug)
    .maybeSingle();
  if (!data) return null;
  return {
    slug: data.slug as string,
    name: data.name as string,
    logoPath: (data.logo_path as string | null) ?? null,
    theme: data.plan === "client" ? parseTheme(data.theme) : null,
  };
}
