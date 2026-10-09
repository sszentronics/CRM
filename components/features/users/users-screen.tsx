"use client";

import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/features/shell/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs } from "@/components/ui/tabs";
import { canManageRole, manageableRoles, ROLE_LABEL, ROLES, type Role } from "@/lib/auth/roles";
import { formatPhone } from "@/lib/format/phone";
import { teamColorVar, type TeamColor } from "@/lib/teams";
import { cn } from "@/lib/utils";
import { ConfirmDrawer, type ConfirmKind } from "./confirm-drawer";
import { PersonDrawer } from "./person-drawer";
import { ChangeLeadDrawer, TeamDrawer } from "./team-drawer";

export type PersonRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: Role;
  team_id: string | null;
  photo_url: string | null;
  is_active: boolean;
  created_at: string;
};

export type TeamRow = {
  id: string;
  name: string;
  color: TeamColor;
  team_lead_id: string;
  is_active: boolean;
  created_at: string;
};

type Panel = "people" | "teams";
type Drawer =
  | { kind: "person"; person: PersonRow | null }
  | { kind: "team"; team: TeamRow | null }
  | { kind: "lead"; team: TeamRow }
  | { kind: "confirm"; action: ConfirmKind; person: PersonRow }
  | null;

function StatusChip({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border px-2.5 text-small font-semibold",
        active ? "border-tl-line bg-tl-raised text-tl-text-2" : "border-tl-danger/30 bg-tl-danger/5 text-tl-danger",
      )}
    >
      {active ? "Active" : "Disabled"}
    </span>
  );
}

function TeamLabel({ team }: { team: TeamRow | undefined }) {
  if (!team) return <span className="text-tl-muted">No team</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: teamColorVar(team.color) }} />
      {team.name}
    </span>
  );
}

export function UsersScreen({
  people,
  teams,
  currentUserId,
  currentRole,
}: {
  people: PersonRow[];
  teams: TeamRow[];
  currentUserId: string;
  currentRole: Role;
}) {
  const canManage = (p: PersonRow) => canManageRole(currentRole, p.role);
  const [panel, setPanel] = useState<Panel>("people");
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "">("");
  const close = () => setDrawer(null);

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const personById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter(
      (p) =>
        (!roleFilter || p.role === roleFilter) &&
        (!q || p.full_name.toLowerCase().includes(q) || p.email.includes(q) || (p.phone ?? "").includes(q)),
    );
  }, [people, query, roleFilter]);

  const columns: Column<PersonRow>[] = [
    {
      key: "name",
      header: "Name",
      primary: true,
      sortValue: (p) => p.full_name.toLowerCase(),
      cell: (p) => (
        <span className="flex items-center gap-3">
          <Avatar name={p.full_name} src={p.photo_url} size={28} team={teamById.get(p.team_id ?? "")?.color} />
          <span className="flex min-w-0 flex-col">
            <span className="font-semibold text-tl-text">
              {p.full_name}
              {p.id === currentUserId ? <span className="ml-2 font-normal text-tl-muted">You</span> : null}
            </span>
            <span className="truncate text-small text-tl-muted">{p.email}</span>
          </span>
        </span>
      ),
    },
    { key: "role", header: "Role", sortValue: (p) => ROLE_LABEL[p.role], cell: (p) => ROLE_LABEL[p.role] },
    {
      key: "team",
      header: "Team",
      sortValue: (p) => teamById.get(p.team_id ?? "")?.name ?? "",
      cell: (p) => <TeamLabel team={teamById.get(p.team_id ?? "")} />,
    },
    {
      key: "phone",
      header: "Phone",
      cell: (p) => (p.phone ? <span className="tl-amount">{formatPhone(p.phone)}</span> : <span className="text-tl-muted">None</span>),
    },
    { key: "status", header: "Status", sortValue: (p) => (p.is_active ? 0 : 1), cell: (p) => <StatusChip active={p.is_active} /> },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: (p) =>
        !canManage(p) ? (
          <span className="text-small text-tl-muted">Superadmin only</span>
        ) : (
        <span className="inline-flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setDrawer({ kind: "person", person: p })} aria-label={`Edit ${p.full_name}`}>
            Edit
          </Button>
          {p.is_active ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDrawer({ kind: "confirm", action: "reset", person: p })}
              aria-label={`Reset password for ${p.full_name}`}
            >
              Reset password
            </Button>
          ) : null}
          {p.id !== currentUserId ? (
            <Button
              size="sm"
              variant="ghost"
              className={p.is_active ? "text-tl-danger hover:text-tl-danger" : undefined}
              onClick={() => setDrawer({ kind: "confirm", action: p.is_active ? "disable" : "enable", person: p })}
              aria-label={`${p.is_active ? "Disable" : "Enable"} ${p.full_name}`}
            >
              {p.is_active ? "Disable" : "Enable"}
            </Button>
          ) : null}
        </span>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Users and teams"
        description={
          currentRole === "superadmin"
            ? "Add staff, set their role and team, and choose who leads each team."
            : "Set up teams, choose who leads them, and add or move Team Leads and agents."
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => setDrawer({ kind: "team", team: null })}>
              <Plus aria-hidden className="size-4" />
              Add team
            </Button>
            <Button onClick={() => setDrawer({ kind: "person", person: null })}>
              <Plus aria-hidden className="size-4" />
              Add person
            </Button>
          </>
        }
      />

      <Tabs
        idPrefix="users"
        label="Users and teams"
        value={panel}
        onChange={setPanel}
        items={[
          { value: "people", label: "People", count: people.length },
          { value: "teams", label: "Teams", count: teams.length },
        ]}
      />

      {panel === "people" ? (
        <section id="users-panel-people" role="tabpanel" aria-labelledby="users-tab-people" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative w-full max-w-sm">
              <label htmlFor="people-search" className="sr-only">
                Search people
              </label>
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-tl-muted" />
              <input
                id="people-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, email or phone"
                className="h-10 w-full rounded-control border border-tl-line-strong bg-tl-surface pr-3 pl-9 text-body text-tl-text placeholder:text-tl-muted"
              />
            </div>
            <label className="flex items-center gap-2 text-label font-medium text-tl-text">
              Role
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as Role | "")}
                className="h-10 rounded-control border border-tl-line-strong bg-tl-surface px-3 text-body text-tl-text"
              >
                <option value="">All roles</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {filtered.length > 0 ? (
            <DataTable
              key={`${query}|${roleFilter}`}
              rows={filtered}
              columns={columns}
              rowKey={(p) => p.id}
              caption="People"
              noun="people"
              pageSize={50}
            />
          ) : (
            <EmptyState
              title="No one matches."
              body="Clear the search or the role filter to see everyone."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery("");
                    setRoleFilter("");
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          )}
        </section>
      ) : (
        <section id="users-panel-teams" role="tabpanel" aria-labelledby="users-tab-teams">
          {teams.length === 0 ? (
            <EmptyState
              title="No teams yet."
              body="Add a person with the Team Lead role, then create their team here."
              action={<Button onClick={() => setDrawer({ kind: "team", team: null })}>Add team</Button>}
            />
          ) : (
            <ul className="grid gap-4 xl:grid-cols-2" aria-label="Teams">
              {teams.map((t) => {
                const lead = personById.get(t.team_lead_id);
                const members = people.filter((p) => p.team_id === t.id && p.role === "agent");
                return (
                  <li
                    key={t.id}
                    className="flex flex-col gap-4 rounded-card border border-tl-line border-t-4 bg-tl-surface p-5 shadow-card"
                    style={{ borderTopColor: teamColorVar(t.color) }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex flex-col gap-0.5">
                        <h3 className="tl-display text-title text-tl-text">{t.name}</h3>
                        <p className="text-small text-tl-muted">
                          {members.length} {members.length === 1 ? "agent" : "agents"}
                        </p>
                      </div>
                      <span className="inline-flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setDrawer({ kind: "team", team: t })} aria-label={`Edit ${t.name}`}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setDrawer({ kind: "lead", team: t })}
                          aria-label={`Change Team Lead of ${t.name}`}
                        >
                          Change Team Lead
                        </Button>
                      </span>
                    </div>
                    <div className="flex items-center gap-3 rounded-control bg-tl-bg px-3 py-2.5">
                      {lead ? <Avatar name={lead.full_name} src={lead.photo_url} size={40} team={t.color} /> : null}
                      <div className="flex flex-col">
                        <span className="text-small text-tl-muted">Team Lead</span>
                        <span className="text-body font-semibold text-tl-text">{lead?.full_name ?? "Unknown"}</span>
                      </div>
                    </div>
                    {members.length > 0 ? (
                      <ul className="flex flex-wrap gap-2" aria-label={`${t.name} agents`}>
                        {members.map((m) => (
                          <li
                            key={m.id}
                            className={cn(
                              "inline-flex items-center gap-2 rounded-full border border-tl-line py-1 pr-3 pl-1 text-label",
                              m.is_active ? "text-tl-text-2" : "text-tl-muted line-through",
                            )}
                          >
                            <Avatar name={m.full_name} src={m.photo_url} size={28} />
                            {m.full_name}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-body text-tl-muted">No agents yet. Add people with the Agent role and this team.</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* Keys remount each drawer so its form state belongs to one person or team. */}
      <PersonDrawer
        key={drawer?.kind === "person" ? `p-${drawer.person?.id ?? "new"}` : "p-closed"}
        open={drawer?.kind === "person"}
        onClose={close}
        person={drawer?.kind === "person" ? drawer.person : null}
        teams={teams}
        roles={manageableRoles(currentRole)}
      />
      <TeamDrawer
        key={drawer?.kind === "team" ? `t-${drawer.team?.id ?? "new"}` : "t-closed"}
        open={drawer?.kind === "team"}
        onClose={close}
        team={drawer?.kind === "team" ? drawer.team : null}
        people={people}
      />
      <ChangeLeadDrawer
        key={drawer?.kind === "lead" ? `l-${drawer.team.id}` : "l-closed"}
        open={drawer?.kind === "lead"}
        onClose={close}
        team={drawer?.kind === "lead" ? drawer.team : null}
        people={people}
      />
      <ConfirmDrawer
        key={drawer?.kind === "confirm" ? `c-${drawer.action}-${drawer.person.id}` : "c-closed"}
        kind={drawer?.kind === "confirm" ? drawer.action : null}
        person={drawer?.kind === "confirm" ? drawer.person : null}
        onClose={close}
      />
    </div>
  );
}
