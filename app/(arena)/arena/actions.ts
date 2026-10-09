"use server";

import { requireActor } from "@/lib/auth/actor";
import { ROLES } from "@/lib/auth/roles";
import { loadArena } from "@/lib/boards/load";
import { isPeriod } from "@/lib/boards/periods";
import type { ArenaData } from "@/lib/boards/types";
import { createClient } from "@/lib/supabase/server";

/** Fresh Arena numbers for a period. Open to all five roles; totals only, never a client. */
export async function refreshArena(period: string): Promise<ArenaData | null> {
  const actor = await requireActor(ROLES);
  const supabase = await createClient();
  return loadArena(supabase, isPeriod(period) ? period : "month", { id: actor.id, role: actor.role });
}
