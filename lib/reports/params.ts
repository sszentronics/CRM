import { isPeriod, type Period } from "@/lib/boards/periods";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export type ReportFilters = { period: Period; team: string | null; broker: string | null };

/** Filters from the address bar. Anything that is not a known period or a uuid is ignored. */
export function parseReportFilters(sp: Raw): ReportFilters {
  const period = one(sp.period);
  const team = one(sp.team);
  const broker = one(sp.broker);
  return {
    period: isPeriod(period) ? period : "month",
    team: team && UUID.test(team) ? team : null,
    broker: broker && UUID.test(broker) ? broker : null,
  };
}
