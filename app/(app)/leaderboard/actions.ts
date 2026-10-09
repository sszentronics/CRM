"use server";

import { requireActor } from "@/lib/auth/actor";
import { ROLES } from "@/lib/auth/roles";
import { boardsFor, type BoardKind, type BoardRow } from "@/lib/boards/kinds";
import { loadBoard } from "@/lib/boards/load";
import { isPeriod } from "@/lib/boards/periods";
import { createClient } from "@/lib/supabase/server";

/** One board for a period. Analysts can only ask for the analyst board. */
export async function refreshBoard(board: string, period: string): Promise<{ rows: BoardRow[]; me: BoardRow | null } | null> {
  const actor = await requireActor(ROLES);
  const allowed = boardsFor(actor.role, actor.team_id !== null);
  if (!allowed.includes(board as BoardKind)) return null;
  const supabase = await createClient();
  return loadBoard(supabase, board as BoardKind, isPeriod(period) ? period : "month", { id: actor.id, teamId: actor.team_id });
}
