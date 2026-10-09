/**
 * Even distribution (BUILD.md Module 4). Pure: it plans, it never writes.
 * Balances both the number of leads and the mix of sources across teams.
 */

export type PoolLead = { id: string; source: string; created_at: string };
export type Plan = Record<string, string[]>;

/** Stable order so the preview and the confirmed run make the same plan. */
function byAge(a: PoolLead, b: PoolLead) {
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Each lead goes to the team with the fewest leads of that source so far,
 * then the fewest leads overall, then the earlier team in `teamIds`.
 * Per source, team counts never differ by more than one; totals stay within one.
 */
export function planEvenDistribution(leads: readonly PoolLead[], teamIds: readonly string[]): Plan {
  const plan: Plan = Object.fromEntries(teamIds.map((t) => [t, [] as string[]]));
  if (teamIds.length === 0) return plan;

  const total = new Map(teamIds.map((t) => [t, 0]));
  const perSource = new Map<string, Map<string, number>>();

  // Largest sources first, so the small ones even out the totals at the end.
  const bySource = new Map<string, PoolLead[]>();
  for (const l of [...leads].sort(byAge)) {
    const list = bySource.get(l.source) ?? [];
    list.push(l);
    bySource.set(l.source, list);
  }
  const sources = [...bySource.keys()].sort((a, b) => bySource.get(b)!.length - bySource.get(a)!.length || (a < b ? -1 : 1));

  for (const source of sources) {
    const counts = new Map(teamIds.map((t) => [t, 0]));
    perSource.set(source, counts);
    for (const lead of bySource.get(source)!) {
      let best = teamIds[0];
      for (const t of teamIds) {
        const better =
          counts.get(t)! < counts.get(best)! ||
          (counts.get(t)! === counts.get(best)! && total.get(t)! < total.get(best)!);
        if (better) best = t;
      }
      plan[best].push(lead.id);
      counts.set(best, counts.get(best)! + 1);
      total.set(best, total.get(best)! + 1);
    }
  }
  return plan;
}

/** Per team: how many of each source the plan gives it. For the preview table. */
export function summarisePlan(plan: Plan, leads: readonly PoolLead[]) {
  const sourceOf = new Map(leads.map((l) => [l.id, l.source]));
  const sources = [...new Set(leads.map((l) => l.source))].sort();
  const rows = Object.entries(plan).map(([teamId, ids]) => {
    const bySource: Record<string, number> = Object.fromEntries(sources.map((s) => [s, 0]));
    for (const id of ids) bySource[sourceOf.get(id)!] += 1;
    return { teamId, total: ids.length, bySource };
  });
  return { sources, rows };
}
