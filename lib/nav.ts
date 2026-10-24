/**
 * Every screen in the app, grouped as the sidebar shows them. Module 1 filters
 * this by role; until then the shell shows all of it so each placeholder can be reached.
 */
export type NavIcon =
  | "today"
  | "pipeline"
  | "arena"
  | "leaderboard"
  | "sessions"
  | "team"
  | "queue"
  | "dashboard"
  | "leads"
  | "addLeads"
  | "assign"
  | "distribution"
  | "deposits"
  | "documents"
  | "reports"
  | "exports"
  | "users"
  | "brokers"
  | "targets"
  | "prizes"
  | "settings"
  | "audit"
  | "workspace"
  | "platform"
  | "profile"
  | "styleguide";

export type NavItem = { href: string; label: string; icon: NavIcon };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
      { href: "/team", label: "Team", icon: "team" },
      { href: "/work-queue", label: "Work queue", icon: "queue" },
    ],
  },
  {
    label: "Sales",
    items: [
      { href: "/today", label: "Today's calls", icon: "today" },
      { href: "/pipeline", label: "Pipeline", icon: "pipeline" },
      { href: "/leads", label: "All leads", icon: "leads" },
      { href: "/leads/add", label: "Add leads", icon: "addLeads" },
      { href: "/team/assign", label: "Assign leads", icon: "assign" },
      { href: "/distribution", label: "Distribution", icon: "distribution" },
      { href: "/sessions", label: "Sessions", icon: "sessions" },
    ],
  },
  {
    label: "Compliance",
    items: [
      { href: "/documents", label: "Documents", icon: "documents" },
      { href: "/deposits", label: "Deposits", icon: "deposits" },
    ],
  },
  {
    label: "Performance",
    items: [
      { href: "/arena", label: "Arena", icon: "arena" },
      { href: "/leaderboard", label: "Leaderboard", icon: "leaderboard" },
      { href: "/reports", label: "Reports", icon: "reports" },
      { href: "/exports", label: "Exports", icon: "exports" },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/users", label: "Users and teams", icon: "users" },
      { href: "/brokers", label: "Brokers", icon: "brokers" },
      { href: "/targets", label: "Targets", icon: "targets" },
      { href: "/prizes", label: "Team prizes", icon: "prizes" },
      { href: "/workspace", label: "Workspace", icon: "workspace" },
      { href: "/settings", label: "Settings", icon: "settings" },
      { href: "/audit-log", label: "Audit log", icon: "audit" },
      { href: "/styleguide", label: "Styleguide", icon: "styleguide" },
      { href: "/platform", label: "All workspaces", icon: "platform" },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The menu item for this page: the longest matching href, so /leads/add highlights "Add leads", not "All leads". */
export function activeHref(pathname: string, hrefs: string[]): string | null {
  return hrefs.filter((h) => isActive(pathname, h)).sort((a, b) => b.length - a.length)[0] ?? null;
}
