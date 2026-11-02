import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { parseTheme, type WorkspaceTheme } from "./theme";

export type Plan = "client" | "trial";

export type Workspace = {
  id: string;
  slug: string | null;
  name: string;
  plan: Plan;
  trialEndsAt: string | null;
  product: "crm" | null;
  theme: WorkspaceTheme | null;
  logoPath: string | null;
};

type Row = {
  id: string;
  slug: string | null;
  name: string;
  plan: Plan;
  trial_ends_at: string | null;
  product: "crm" | null;
  theme: unknown;
  logo_path: string | null;
};

export const WORKSPACE_COLUMNS = "id, slug, name, plan, trial_ends_at, product, theme, logo_path";

export function toWorkspace(row: Row): Workspace {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    plan: row.plan,
    trialEndsAt: row.trial_ends_at,
    product: row.product,
    theme: parseTheme(row.theme),
    logoPath: row.logo_path,
  };
}

/** The signed-in person's workspace. Row-level security returns only their own. Null when signed out. */
export const getWorkspace = cache(async (): Promise<Workspace | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("workspaces").select(WORKSPACE_COLUMNS).maybeSingle<Row>();
  return data ? toWorkspace(data) : null;
});
