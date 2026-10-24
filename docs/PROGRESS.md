# Build progress

## Module 0: foundation and design system

Status: **ready for review**. `pnpm test:db` has not run yet because Docker is not running on the dev machine (see
Open items).

### Direction change (8 Oct 2026)

On review, the owner asked for a **web app for laptop screens** in **white and purple**, looking more
professional. AGENTS.md, BUILD.md and DESIGN.md were updated to match: light page, white surfaces, a deep purple
sidebar where the white logo lives, one purple accent (`#5B2EC9`), upright Archivo numbers, 8 and 12 px radii, soft
shadows, right-hand drawers. The Arena stays dark purple. `expectPurplePage` became `expectBrandPage`.

### Built

- Next.js 16.4 (App Router, Turbopack, Cache Components), TypeScript strict, Tailwind 4, pnpm scripts `lint`,
  `typecheck`, `test`, `test:db`, `test:e2e`, plus `db:start`, `db:stop`, `db:reset`.
- White and purple tokens in `app/globals.css`, mapped into Tailwind (`bg-tl-surface`, `text-tl-muted`,
  `shadow-card`, ...). Breakpoints: 1024 (laptop), 1280, 1920 (TV). `tl-display`, `tl-amount`, `tl-slant`,
  `tl-arena` utilities. Reduced motion is honoured globally.
- Fonts with `next/font`: Archivo (display, 700) and Figtree (text).
- Base components in `components/ui`: Button, Card (with CardHeader), Sheet (right-hand drawer with pinned footer),
  Input, Select, StageChip, Avatar, MoneyText (count-up), SlantBar, RankBadge, Toast (top right, max two),
  DataTable (sortable, sticky header, row count, cards on narrow windows), EmptyState, CountTile.
- App shell: 248 px purple sidebar with logo, wordmark and grouped menu (Overview, Sales, Compliance, Performance,
  Administration); white top bar with search, bell and user. Below 1024 px a menu button opens the sidebar as a
  drawer. PageHeader for screen titles. Placeholder pages for every screen, each naming the module that builds it.
  `/` redirects to `/styleguide` until Module 1 adds role homes.
- `/styleguide` showing every token, component and stage chip.
- Formatting helpers in `lib/format`: `formatPKR`, `formatPKRCompact`, `normalisePhone`, `formatPhone`, `maskTail`,
  `formatKarachi`.
- Supabase: `supabase init`, a foundation migration installing pgTAP, and `supabase/tests/00_foundation.test.sql`,
  which also guards that every table in `public` has RLS enabled.
- Test tooling: Vitest, Playwright with `@axe-core/playwright`, shared `expectBrandPage` helper in
  `tests/e2e/helpers/brand.ts`.

### Tests

| Test | Result |
| --- | --- |
| Unit: `formatPKR(250000)` is `Rs 250,000`, `formatPKR(0)` is `Rs 0` | pass |
| Unit: `normalisePhone` normalises the three listed forms and rejects `12345` | pass |
| Unit: `maskTail('3520212345671')` shows only the last 4 digits | pass |
| E2E: `/styleguide` passes `expectBrandPage` at 1024, 1366 and 1440 px with no horizontal scroll | pass |
| E2E: the logo renders on the purple sidebar with alt text "Trading Labs" | pass |
| Accessibility: axe finds no serious or critical issues at 1024, 1366 and 1440 px | pass |
| Accessibility: every text, meaning and stage colour is at least 4.5 to 1 on bg, surface and raised | pass |
| Extra: narrow-window menu drawer, drawer asks before discarding input, toasts cap at two | pass |
| DB: pgTAP installed, every `public` table has RLS | **not run, Docker is not running** |

Totals: lint clean, typecheck clean, 21 unit tests passing, 13 e2e tests passing, `pnpm build` succeeds.

### Done when

- [x] `pnpm build` succeeds and all checks are green. (All green except `test:db`, which is waiting on Docker.)
- [ ] A person looking at `/styleguide` on a laptop sees a clean white and purple app with the TL logo. (Checked in
      the browser at 1440 px. Waiting on your review.)

### Decisions to confirm

- **shadcn/ui:** the base components are written in the shadcn pattern (`cva`, `cn`, files you own in
  `components/ui`) but without running the shadcn CLI or adding Radix. Select is the native select; Sheet is the native
  `<dialog>`. Radix can be added later if a component needs it.
- **Phone validation:** `normalisePhone` accepts any 10-digit Pakistani national number that does not start with 0,
  so it accepts landlines as well as mobiles. If only mobiles (starting with 3) should be accepted, say so.
- **Masking:** `maskTail` always returns `•••• 1234`, so the masked text does not reveal how long the value is.
- **Compact money:** `Rs 1.2M` rounds down so a list never overstates an amount.

### Open items

- Docker Desktop did not start on this machine, so `pnpm db:start` and `pnpm test:db` have not run. Start Docker
  Desktop, then run `pnpm db:start && pnpm test:db`.
- The `trading-labs/` folder holds only an old `.next` build cache from before the project moved. It is ignored by git,
  ESLint and TypeScript, and is safe to delete.
- Module 1 should set `enable_signup = false` in `supabase/config.toml` (no sign-up).
- BUILD.md section 10 open questions are still open. None of them block Module 1 except the first one: do staff sign
  in with email or with phone number?

## Module 1: sign-in, roles, users and teams

Status: **ready for review.** All checks green.

Decision: staff sign in with **email and password** (answered 8 Oct 2026). Admin and Superadmin add a TOTP code.

### Built

- Migration `20261008010000_users_teams.sql`: `app_role` and `team_color` enums; `profiles`, `teams`, `audit_log`
  with RLS and a default deny. Admin rights in the database need `aal2` (the TOTP step), not just the role.
  Triggers: only the Superadmin changes name, role, team, phone, email or status (others may change their photo);
  exactly one Team Lead per team (partial unique index plus triggers that move both people when the lead changes);
  a leading Team Lead cannot leave, change role or be disabled first; audit rows cannot be updated, deleted or
  truncated, even by the database owner. `profiles_public` view (id, name, photo, role, team). Server-only
  `admin_end_sessions()`. Public `avatars` bucket where each user writes only their own folder.
- Auth config: sign-up off, TOTP on, 10-character minimum password, invite and reset email templates that link to
  `/auth/confirm`. Local rate limits raised for tests (production limits are set in the hosted project).
- Proxy refreshes the session and sends signed-out visitors to `/login`. Every page and action re-checks on the
  server: `requireSession`, `requireAccess(path)`, `requireActor(roles)`. Route rules live in `lib/auth/access.ts`.
- Screens: login (purple brand panel), forgot and reset password, two-step sign-in with QR enrolment, role home
  redirect, "No access", Users and teams (people table with search and role filter, team cards, drawers to add,
  edit, move, disable or enable, reset password, add team, change Team Lead), My profile (photo, password, sign out).
  The menu shows only what the role may open. Idle sign-out after 30 minutes for Admin and Superadmin.
- `logAudit()` writes with the service role after the permission check; every user, team and password change is
  audited with old and new values.
- `onUserDisabled()` hook is wired into disable and does nothing until Module 4 adds leads.
- `pnpm superadmin:create` bootstraps the first Superadmin.

### Tests written

| Test | Result |
| --- | --- |
| DB: RLS enabled on profiles, teams, audit_log | pass |
| DB: an agent cannot read another user's phone or email, can read `profiles_public` | pass |
| DB: nobody can update or delete an audit row; only an aal2 Superadmin can select | pass |
| DB: a second Team Lead on the same team is rejected; changing the lead moves both people | pass |
| E2E: each of the five roles signs in and lands on its home route | pass |
| E2E: a disabled user sees "Account disabled, contact your Admin" | pass |
| E2E: an agent gets "No access" on `/users`; replaying the create-user action as the agent is refused | pass |
| E2E: an admin is asked for a 6-digit code after the password | pass |
| E2E: Done-when, the Superadmin builds 4 teams, 8 agents, 2 analysts, 1 admin from the UI | pass |
| E2E: move an agent, change a Team Lead, disable someone | pass |
| Unit: creating a user writes one audit row with the actor and the new user id | pass |
| Unit: route access map, safe `next` redirects, user form rules | pass |

Lint clean, typecheck clean, 35 unit tests, 23 database tests and 29 browser tests passing (including all of Module 0's), `pnpm build` succeeds.

### Done when

- [x] The Superadmin can create 4 teams with a Team Lead and 2 agents each, 2 analysts and 1 admin from the UI.
      (Covered by `tests/e2e/users.spec.ts`, which does exactly this through the screens and checks the database
      and the 15 audit rows.)

### Fixed while testing

- The local auth config had switched off the email provider entirely, not just sign-up. Email sign-in is back on;
  sign-up stays closed.
- Supabase signs out an account's other password-only sessions when it completes the 6-digit step. This is a
  safeguard, so the tests now give the "asked for a code" check its own account.
- The session read is marked request-time (`connection()`), which removes Next's prerender clock warnings.

### Open items

- The local database now holds the test accounts and teams from the browser tests (`e2e-*@tradinglabs.test`).
  `pnpm db:reset` wipes them; the tests recreate what they need.
- Hosted Supabase needs the same auth settings as `supabase/config.toml` (sign-up off, TOTP on, 10-character
  passwords, the two email templates, SMTP). Module 12 writes this into the deployment steps.
- Module 0's styleguide tests now sign in as a test Superadmin first, because the styleguide is a Superadmin screen.
- The idle limit is a constant (30 minutes) until Module 2 adds the settings table.

## Module 2: brokers, targets and settings

Status: **ready for review.** All checks green.

### Built

- Migration `20261008020000_brokers_targets_settings.sql`: `brokers` (market enum, KYC checklist as an array of
  document types, on/off), `targets` (team, first day of month, whole rupees, unique per team and month),
  `settings` (key, JSON value, who changed it and when) seeded with every default from BUILD.md section 6.
- RLS: everyone signed in reads active brokers, all targets (the Arena needs them) and settings. Only an aal2
  Superadmin inserts or updates. No delete policy on any of the three. A trigger locks targets for months before the
  current Karachi month, for every role including the service role.
- `getSetting()` and `getAllSettings()` validate each value against its definition and fall back to the default if a
  row is missing or malformed. Idle sign-out now reads `idle_signout_minutes` instead of a constant.
- Screens: Brokers (table, add and edit drawer with market picker and checklist, on/off switch), Targets (teams by
  months grid: two locked past months, this month highlighted, three ahead, live company total, "Copy last month",
  unsaved-change count), Settings (grouped cards, edit in place, list editor for the three lists).
- Every change is audited with old and new values: `broker.create|update|enable|disable`, `target.set` (one row per
  changed cell), `setting.update`.
- Shared `guardedAction()` wrapper for server actions (re-checks the role, turns refusals into messages).

### Tests

| Test | Result |
| --- | --- |
| DB: admin, team_lead, agent, analyst cannot insert or update brokers, targets, settings (20 checks) | pass |
| DB: a target for a past month cannot be changed or added | pass |
| DB: every default setting exists; switched-off brokers hidden from non-Superadmins; nothing can be deleted | pass |
| Unit: `getSetting('max_call_tries')` returns 5 on a fresh database (runs against local Supabase) | pass |
| Unit: setting limits and fallbacks, Karachi month boundaries, rupee parsing, broker form rules | pass |
| E2E: the Superadmin adds a PSX and a PMEX broker, unticks one checklist item, and it is saved | pass |
| E2E: changing a setting writes an audit row with the old and new value | pass |
| E2E: list settings gain and lose items; Admin gets "No access" on all three screens | pass |
| E2E: this month's targets saved for every team, then copied into next month | pass |

Totals: lint and typecheck clean, 45 unit and integration tests, 54 database tests, 34 browser tests (Modules 0 to 2)
passing.

### Done when

- [x] Two brokers, this month's targets for all teams, and all default settings exist. (The settings come from the
      migration; the brokers and targets are created through the screens by `tests/e2e/config.spec.ts`.)

### Decisions to confirm

- **KYC document types.** BUILD.md does not list them. The checklist editor offers: CNIC front, CNIC back,
  passport-size photo, signature specimen, proof of income or source of funds, bank statement or cancelled cheque,
  proof of address, Zakat declaration (CZ-50), nominee CNIC. New brokers start with the first six ticked. Tell me
  what to add, remove or rename.
- **Checklist changes apply to new clients only.** The broker keeps one live checklist; Module 7 copies it onto each
  client's KYC profile when it is created, so later edits do not change clients already in progress.
- **Targets screen range.** Two past months (read-only), this month and three ahead.

### Open items

- `pnpm test` now includes `tests/integration`, which needs the local database running (`pnpm db:start`).

## Owner decisions (8 Oct 2026)

- Six default KYC documents are the standard set; the other three stay optional per broker. No code change.
- Landline and mobile numbers are both valid. No code change (`normalisePhone` already accepts both).
- Analysts get their own credit for referred clients' verified deposits, separate from the team's. Applies in
  Modules 8 and 9.
- **Client documents are not saved or hosted.** Module 7 and the proof upload in Module 8 need a new design before
  they are built. Recorded in BUILD.md section 10.

## Owner decisions, round 2 (8 Oct 2026)

- Withdrawn deposits are reversed and come off the boards (Module 8 and 9).
- Team prizes: Superadmin or Admin sets one per team per month; the whole team wins it on reaching the target.
  Planned for Module 9 next to targets.
- The Arena is visible to all five roles.
- **Admin manages teams and their people** (built now, on top of Module 1):
  - Migration `20261008030000_admin_manages_teams.sql`: profiles insert and update policies and the column-rights
    trigger let an aal2 Admin manage Team Leads and agents only; team insert and update open to Admin.
  - `/users` opens for Admin; actions re-check scope on the server (`canManageRole`); the screen offers only Team
    Lead and Agent and shows "Superadmin only" on rows the Admin may not manage.
  - Tests: new `03_admin_manages_teams.test.sql` (9 checks); the Module 1 test "an admin cannot change teams" and
    the unit test "Users and teams is Superadmin only" were updated to the new rule; new browser test for the Admin.
  - Results: 63 database tests, 45 unit tests and 35 browser tests passing.

## Module 3: lead intake and search

Status: **ready for review.** All checks green.

### Built

- Migration `20261008040000_leads.sql`: `lead_stage` enum (12 stages), `leads` with every column from BUILD.md
  section 5. Phone is unique and must be `+92` and 10 digits. Trigram index for name search.
- RLS: only an aal2 Superadmin or Admin inserts, and only a lead in stage `new`, with no team or agent, recording
  the real creator. Superadmin and Admin read every lead; Module 4 adds Team Lead, agent and analyst scopes.
  `existing_lead_phones()` is server-only and returns numbers, never lead details.
- One validator (`lib/leads/validate.ts`) for the form and the import: name, phone (normalised), source (must be
  one of the `lead_sources` setting, stored in its spelling), optional city, campaign, notes.
- Add leads screen (`/leads/add`, Superadmin and Admin):
  - One lead: "Save" opens the new lead; "Save and add another" clears the form and keeps the source.
    A duplicate shows "That number is already in the system." with a link to the existing lead.
  - Import a file: upload (.csv or .xlsx, up to 2,000 rows, downloadable template), match columns (guessed from the
    headers, with "Same source for every row"), review (new, duplicate, invalid counts and the reason for each
    skipped row), import, then download the skipped rows with a Reason column. Everything is re-checked on the
    server at import time.
- Search: live results in the top bar from 3 characters (name, full or partial phone), Enter opens `/search`.
  Results come through the caller's own session. A full phone that exists outside the caller's scope returns only
  "Already in the system."
- A basic lead page at `/lead/[id]` (details and a call button). Not found and not allowed look the same.
- Dependency: `read-excel-file` 9.3.10 (MIT, pinned) reads .xlsx in the browser. CSV parsing and writing are in
  `lib/leads/import.ts`; downloaded CSVs defuse spreadsheet formulas.

### Tests

| Test | Result |
| --- | --- |
| DB: only an aal2 Superadmin or Admin can insert leads (team_lead, agent, analyst, aal1 Admin refused) | pass |
| DB: two leads with the same normalised phone cannot exist | pass |
| DB: a new lead must be stage new, no team, real creator, normalised phone; duplicate check is server-only | pass |
| Unit: the 10-row file with 2 duplicates and 1 bad phone reports 7 new, 2 duplicate, 1 invalid | pass |
| Unit: skip reasons and row numbers, column guessing, CSV quoting and formula defusing, source rules | pass |
| E2E: importing that file adds exactly 7 leads and offers the 3 skipped rows as a download | pass |
| E2E: adding a lead with an existing phone shows the duplicate message and adds nothing | pass |
| E2E: search for a seeded phone returns the lead for an Admin (live and on the results page) | pass |
| E2E: an agent searching a phone they cannot see gets only "Already in the system"; Add leads is closed to them | pass |
| E2E: Done when, one lead by form and 200 by file | pass |

Totals: lint and typecheck clean, 55 unit and integration tests, 78 database tests, 41 browser tests passing.

### Done when

- [x] The Superadmin can add one lead by form and 200 by file.

### Open items

- Search by CNIC waits for Module 7. Because client documents are not stored, Module 7's redesign decides whether
  a CNIC number is kept at all; the search box says "name or phone" until then.
- The lead page is minimal; Module 5 builds the full one.

## Module 4: distribution and assignment

Status: **ready for review.** All checks green.

### Built

- Migration `20261008050000_distribution.sql`:
  - `notifications` (own rows only; only `read_at` can change; written by the system through `private.notify`;
    Realtime on) and `assignments` (append-only history, no update or delete for anyone).
  - RLS on `leads` for all five roles: Superadmin and Admin see all; a Team Lead sees their team; an agent sees only
    their own leads; analysts see none until Module 6. A guard trigger stops Team Leads moving a lead out of their
    team and agents reassigning; name, phone and source change only through an Admin.
  - `assign_leads_to_team`, `assign_leads_to_agent`, `return_open_leads`: one transaction per batch, run as the
    caller so RLS applies, each move writes an `assignments` row and notifies the receiver. Moving between teams and
    reassigning need a reason. Assigning to an agent sets `agent_assigned_at` (the first-call countdown).
  - Fixes and helpers: `20261008051000_workload.sql` (open and waiting counts), `20261008052000_assign_agent_lookup.sql`
    (correct refusal when a Team Lead targets another team's agent), `20261008053000_pool_summary.sql` (pool counts by
    source in the database).
- `lib/leads/stage-machine.ts`: the full transition table from section 4 (new to assigned is used now).
- `lib/leads/distribution.ts`: pure even-distribution planner. Per source, team counts never differ by more than
  one, and totals stay within one. Deterministic, so the preview and the confirmed run agree.
- Screens:
  - Lead distribution (Admin): pool chips by source, filters (source, campaign, name), tick boxes, team panel with
    workload, "Distribute evenly" with a preview drawer (team by source), "Assign to team".
  - Assign leads (Team Lead): Unassigned and Assigned tabs, people panel with open and today counts, assign to one
    person (including yourself), "Split evenly" with a choice of people, reassign with a required reason.
    Returned leads are marked.
  - All leads (Admin): filters (stage, team, person, source, name or phone, returned only), saved views (four built
    in, plus your own saved in this browser), pagination, bulk "Move to team" and "Assign to person" with a reason.
  - Bell in the top bar: live unread count over Realtime, latest notifications, mark all as read, opens the link.
- Disabling a person now returns their open leads to their Team Lead's unassigned list, and the toast says how many.
- Audit: every distribution, move, assignment and split; target saves now write their audit rows in one request.

### Tests

| Test | Result |
| --- | --- |
| Unit: 200 leads, 4 sources, 4 teams gives 50 each, per-source counts within 1 | pass |
| Unit: the planner writes nothing (pure, deterministic, inputs untouched); uneven mixes stay balanced | pass |
| Unit: every stage pair in section 4 is allowed or refused correctly | pass |
| DB: an agent selecting from leads gets only rows where agent_id is theirs | pass |
| DB: a team_lead gets only their team's rows and cannot set team_id to another team | pass |
| DB: assignments cannot be updated or deleted, by any role or the database owner | pass |
| DB: moves need reasons; cross-team assignment refused; notifications private and read-only; returns work | pass |
| E2E: Admin distributes, Team Lead splits evenly, each agent gets a "Lead assigned" notification | pass |
| E2E: reassigning without a reason is blocked; with one it is recorded | pass |
| E2E: disabling an agent moves their open leads back to the Team Lead's unassigned list | pass |
| E2E: an agent searching a phone in another team sees only "Already in the system"; the URL shows No access | pass |
| E2E: Done when, 200 pool leads to 12 people (4 Team Leads, 8 agents), clicking under a minute | pass |

Totals: lint and typecheck clean, 63 unit and integration tests, 102 database tests, 46 browser tests passing.

### Done when

- [x] 200 seeded leads can go from the pool to 12 people in under a minute of clicking.

### Decisions to confirm

- **Saved views on All leads** are stored in each person's browser (plus four built-in views). If views should be
  shared between Admins, they move to the database.
- **A Team Lead can take leads themselves** and is offered in "Split evenly" (unticked by default).
- **Leads that move to another team keep their stage** (for example a follow-up stays a follow-up) and lose their
  agent; the new Team Lead reassigns them.

### Open items

- The local test database has grown (about 2,000 leads, 90 teams) from repeated runs; `pnpm db:reset` clears it.
- The first-call countdown is stored now; Today's calls shows it in Module 5.

## Module 5: lead page, calls and follow-ups

Status: **ready for review.** All checks green.

### Built

- Migration `20261008060000_calls.sql`:
  - `activities` (append-only timeline: call, WhatsApp, note, stage change, system) and `follow_ups` (open, done,
    missed). Both readable only by people who can see the lead; written only through the functions below.
  - A stage trigger that mirrors the section 4 table: illegal moves refused; open stages need a booked follow-up;
    Not interested and Invalid need a reason; only the Team Lead or Admin acts on an Invalid mark; only an Admin
    returns a lead to the pool, and only after the cooling-off period.
  - `record_lead_event`: one call, note, WhatsApp tap or stage move, applied atomically. It checks access, refuses a
    stale stage ("This lead changed while you were working on it"), closes open follow-ups and books the next,
    writes one activity row and one audit row with the server's user and time, and sends notifications (lead returned,
    Invalid to confirm, Invalid rejected, note from the Team Lead).
  - `confirm_invalid` for the Team Lead. `run_follow_up_sweep`, run by `pg_cron` every 5 minutes: "due soon"
    reminders 30 minutes ahead, an "overdue" reminder once, and follow-ups more than 15 minutes late become missed.
  - `20261008061000_return_to_pool.sql`: returning a Not interested lead to the pool clears team and agent.
- `lib/leads/stage-machine.ts` now decides calls and moves: outcome required; a note for Interested and Not interested;
  a follow-up for Interested, Follow-up and No answer; a reason for Not interested and Invalid; the lead returns to the
  Team Lead on reaching `max_call_tries`. The database checks the same rules again.
- Lead page: header with stage chip and badges, contact strip (number, WhatsApp, Call), next-action bar (first-call
  countdown, next or overdue follow-up, closed state), slanted stage tracker, Timeline (calls, notes, moves and
  assignment history), Session, Documents and Deposits marked "coming soon", stage buttons by stage, Team Lead
  confirm or reject for Invalid, Admin "Return to the pool", notes (a Team Lead's note notifies the agent).
- Log a call drawer: five outcomes (only those the stage allows), quick follow-up picks in Karachi time plus a date
  and time picker, reason list from settings, notes. A No answer is two clicks: the outcome, then Save.
- Today's calls (agent and Team Lead home): count strip, Overdue first in red with the word "Overdue", Due today,
  New leads with the first-call countdown, "Log call" on each row so a list can be cleared without leaving the page.
- My pipeline and Team pipeline: stage columns, filters (name, source, person), "Show closed", Stale mark.
- Fixed across the app: `cn()` now knows the custom type scale, so merged classes no longer drop text colours or
  sizes (small primary buttons had faint labels). Users and teams pages its people table (50 at a time).

### Tests

| Test | Result |
| --- | --- |
| Unit: every stage pair is allowed or refused per section 4 | pass |
| Unit: saving an open stage without next_follow_up_at fails | pass |
| Unit: the fifth No answer clears the agent and sets returned_to_lead | pass |
| Unit: call rules (outcome, note, follow-up, reason), allowed outcomes per stage, Karachi time helpers | pass |
| DB: activities cannot be updated or deleted by any role | pass |
| DB: agent B cannot read agent A's activities or follow-ups | pass |
| DB: calls write one activity with the server's user; rules, stale stage, other agent's lead refused | pass |
| DB: return to Team Lead, Invalid confirm and reject rights, the sweep marks missed and reminds | pass |
| E2E at 1366 px: an agent opens a lead, clicks Call, saves a No answer in 2 clicks inside the drawer | pass |
| E2E: an overdue follow-up appears first, in red, on Today's calls | pass |
| E2E: marking Not interested without a reason is blocked | pass |
| E2E: the Team Lead rejects an Invalid mark and the lead returns to follow_up | pass |
| E2E: an agent opening another team's lead by URL sees "No access" | pass |
| E2E: the pipeline groups by stage and marks stale leads | pass |
| E2E: Done when, an agent clears 15 calls without leaving Today's calls | pass |

Totals: lint and typecheck clean, 81 unit and integration tests, 131 database tests, 53 browser tests passing.

### Done when

- [x] An agent can clear a list of 15 calls from a laptop without leaving Today's calls.

### Decisions to confirm

- **A call whose outcome matches the current stage** (for example a second "Interested" call) is allowed and only
  updates the follow-up; it is not treated as a stage change.
- **Missed follow-ups**: a follow-up still open 15 minutes after it was due counts as missed (this feeds the streak
  in Module 9).
- **Call button on laptops** opens the Log a call drawer; the number itself is a `tel:` link for phones. WhatsApp
  opens `wa.me` in a new tab and records a timeline entry.
- **Quick picks** use 11 am Karachi time for "Tomorrow", "In 2 days" and "Next week".

### Open items

- Analyst referral, documents and deposits buttons on the lead page are visible but disabled until Modules 6 to 8.
- The local test database now holds about 600 test staff and 3,300 leads; `pnpm db:reset` clears it.

## Module 6: analyst sessions

Status: **ready for review.** All checks green, with one test deferred (see Open items).

### Built

- Migration `20261008070000_sessions.sql`:
  - `sessions` (referral note, preferred and booked time, mode, accept time, outcome, client level, interest, notes,
    next step, hand-back and cancel times). One open session per lead.
  - RLS on `leads` (and so the timeline and follow-ups) extended: an analyst reads a lead only while an open session
    is assigned to them; access ends at hand-back. Unclaimed "any available" referrals are visible to all analysts
    through `open_referrals()`, which shows only the client's first name, source, city and the agent's note.
  - Functions, each atomic with timeline, audit and notification rows: `refer_to_analyst` (lead to with_analyst,
    agent stays owner; tells the named analyst or every analyst), `accept_referral` (one conditional update, so
    exactly one analyst wins an "any available" referral), `schedule_session` (book or move), `record_session_outcome`
    (Attended: post_session and the analyst is credited; No-show: stage unchanged; both hand back),
    `cancel_referral` (back to interested). `analyst_load()`, `my_analyst_credit()`.
  - `run_referral_sweep`, every 15 minutes: alerts every Admin once when a referral has no session date after
    `referral_deadline_hours`.
- `lib/sessions/rules.ts`: who can be referred, what Attended and No-show do, the hand-back report rules.
- Lead page: "Refer to Technical Analysis" and "Book another session" open the referral drawer (analyst list with
  open-session counts or Any available, preferred time, mode, required note). Session tab: every referral with its
  status; Accept, book or move, and "Save and hand back" for the analyst; Cancel referral for the agent, Team Lead
  or Admin; the analyst's report for everyone who owns the lead. Analysts land on the Session tab and do not see the
  Documents or Deposits tabs.
- Session queue (analyst home): counts, New referrals with Accept, Today's sessions, Upcoming (including ones still
  to book), "My credit". Admins see every open referral, who has it, and which are past the deadline.
- `useToastAction`: shows the result of an action even when the form disappears because of it (accepting a referral,
  handing back).

### Tests

| Test | Result |
| --- | --- |
| DB: an analyst reads only leads with an open session assigned to them, and loses access after hand-back | pass |
| DB: when two analysts accept the same "any available" referral, exactly one succeeds | pass |
| DB: referral needs a note, moves the lead to with_analyst, agent stays owner; analysts cannot refer | pass |
| DB: Attended moves to post_session and credits; No-show changes neither; cancelling returns to interested | pass |
| DB: an analyst cannot read kyc_profiles, documents or deposits | **deferred**: those tables arrive in Modules 7 and 8 |
| Unit: Attended sets the credited analyst and the stage; No-show changes neither | pass |
| Unit: who can be referred; the hand-back report rules | pass |
| E2E: agent refers, analyst accepts and schedules, records Attended; agent sees the notes and a notification | pass |
| E2E: an interested lead can go straight to documents without any referral | pass |
| E2E: no-show keeps with_analyst; the agent refers again and cancels back to Interested | pass |

Totals: lint and typecheck clean, 87 unit and integration tests, 153 database tests, 56 browser tests passing.

### Done when

- [x] A lead can pass through a session and come back to the agent with notes, or skip the session entirely.

### Decisions to confirm

- **A referral sent to a named analyst** gives that analyst access to the lead straight away (before they accept),
  following section 3's "an open session assigned to that analyst". "Any available" referrals give access only after
  accepting.
- **"My credit"** shows clients credited and sessions held; the rupee figure arrives with verified deposits in
  Module 8.
- **Client level** choices: Beginner, Some experience, Experienced. **Interest**: Low, Medium, High.

### Open items

- The DB test "an analyst cannot read kyc_profiles, documents or deposits" is written with Modules 7 and 8, when those
  tables exist.

## Module 7: KYC documents (redesigned: no files)

Status: **ready for review.** All checks green.

Owner decisions (8 Oct 2026): keep the key KYC fields; the agent ticks each document and the Admin approves;
deposits (Module 8) are verified by reference number. Recorded in BUILD.md section 10.

### Built

- Migration `20261008080000_kyc.sql`: `kyc_profiles` (one per client, broker, a snapshot of the broker's checklist,
  the typed KYC fields, status) and `documents` (one row per checklist item: collected, approved or rejected, by whom,
  when, reason). No file columns and no storage bucket. CNIC is 13 digits and unique; IBAN is 24 characters starting
  with PK. RLS: Admin all, Team Lead own team, agent own clients, analysts nothing (even with an open session).
  Triggers keep the status in step (approved when every item is approved and every field filled; submitted when every
  item is collected), lock approved details for agents, and block changing broker once anything is approved.
  Functions: `set_document_collected`, `review_document` (rejecting needs a reason and notifies the agent),
  `approve_all_documents`, `unlock_document`, and server-only `lead_with_cnic`. Every tick and review writes an audit
  row with the document id; field changes audit which fields changed, never their values.
- `lib/kyc/fields.ts`: CNIC and IBAN validators and formatters, income bands, risk levels, the KYC form schema
  (part-filled saves allowed, anything entered must be valid; an expired CNIC is refused), missing-field check.
- Lead page Documents tab: progress line, broker picker, checklist with status per item, KYC details form with the
  two tick boxes (SIM in the client's own name, consent), and "Record a deposit" disabled until every document is
  collected and every detail filled. Admins approve, reject or unlock from the same checklist.
- Document review (Admin): Waiting for review and All in progress, days waiting (red after 2 days), masked CNIC in
  the list, a drawer with the typed details (full CNIC and IBAN) beside the checklist, Approve all.
- Today's calls: "Documents to fix" with each rejection reason in red.
- Search by CNIC in the top bar (13 digits, with or without dashes), within the caller's scope; a CNIC on someone
  else's client shows only "Already in the system".

### Tests

| Test (adapted from the file-based spec) | Result |
| --- | --- |
| Unit: CNIC and IBAN validators accept valid values and reject wrong lengths, prefixes and letters in the CNIC | pass |
| DB: a duplicate CNIC number is rejected | pass |
| DB: an agent from another team, and any analyst (even with an open session), cannot read the profile or items | pass |
| DB: an analyst cannot read kyc_profiles or documents (deferred from Module 6; deposits follow in Module 8) | pass |
| DB: no file path exists on documents; nothing is stored | pass |
| DB: reviewing writes an audit row with the document id; rejection needs a reason and notifies the agent | pass |
| DB: an agent cannot replace an approved document; approved details and broker lock for the agent | pass |
| E2E: approving a document as Admin writes an audit row with the document id | pass |
| E2E: an agent cannot replace an approved document (no tick controls remain) | pass |
| E2E: a rejected item shows its reason in red and appears on the agent's Today's calls | pass |
| E2E: "Record a deposit" is disabled until every item and field is complete | pass |
| E2E: Done when, a full KYC set collected on the lead page and reviewed on the Admin screen | pass |
| E2E: a CNIC finds the client from the search box | pass |
| Integration: a signed URL stops working after it expires | **not applicable**: no files are stored |

Totals: lint and typecheck clean, 96 unit and integration tests, 176 database tests, 60 browser tests passing.

### Done when

- [x] A full KYC set can be collected and reviewed from laptops (no uploads, per the owner's decision).

### Decisions to confirm

- **Income bands** (monthly): under Rs 50,000; 50,000 to 150,000; 150,000 to 500,000; over 500,000.
- **Risk level and PEP** are recorded by the agent from the client's answers.
- **Documents waiting more than 2 days** show in red on the review queue.

### Housekeeping

- The local database was reset (with the owner's approval) to clear test data that had grown to about 700 staff and
  280 teams. All 13 migrations replayed cleanly from empty. Recreate a local Superadmin with `pnpm superadmin:create`.


## Module 8: deposits and verification

Status: ready for review.

### Built

- Migration `20261008090000_deposits.sql`: `deposits` and `feed_events` with RLS, plus `record_deposit`,
  `verify_deposit`, `reject_deposit`, `reverse_deposit`, `ask_agent_about_deposit`, `deposit_queue_context` and an
  updated `my_analyst_credit` (now returns rupees). Realtime is on for `feed_events`.
  - No proof file: a deposit is checked by its **reference number**, amount, date and method against the bank or
    broker statement (owner decision, 8 Oct 2026). There is no `proofs` bucket.
  - `agent_id`, `team_id` and `credited_analyst_id` are copied onto the deposit when it is recorded and a trigger
    stops them changing. A recorded deposit cannot be edited or deleted; it is rejected or reversed instead.
  - Writes only go through the functions: agents and Team Leads have no update grant, so nobody can set `verified`
    by hand. Verifying needs an Admin who did not record the deposit, KYC `approved`, and the "matches the
    statement" confirmation.
  - Verifying moves a `deposit_recorded` lead to `deposit_verified`, writes exactly one `feed_events` row (team,
    agent, amount, no lead or client) and notifies the agent, their Team Lead and the credited analyst. The
    analyst's message names no client.
  - Rejecting needs a reason. A rejected first deposit returns the lead to `documents_pending` with a follow-up
    tomorrow. Reversing needs a reason and removes the deposit from every verified total.
  - Cash above `cash_flag_limit_pkr` sets `cash_flag` and warns the agent in the sheet.
- Lead page: a Deposits tab (verified total, every deposit with its status and any rejection or reversal reason) and
  the Add-deposit drawer (broker and type shown read-only, credited analyst read-only, amount, date, method,
  reference). "Record a deposit" on the Documents tab and the side card now opens the drawer.
- Deposit verification (Admin, `/deposits`): Pending (red after a day), Verified and Rejected tabs, a detail drawer
  with the client's bank to compare with the statement, Verify, Reject, Ask the agent and Reverse.
- "My credit" on the analyst's session queue now shows verified rupees.
- Notifications: deposit to verify, verified, rejected, reversed and a question about a deposit.
- Small copy fix: "1 lead sent to 1 team" and "1 lead split between 1 person" (they read "1 leads" before).

### Tests

| Test | Result |
| --- | --- |
| Unit: type is `first` for the first deposit and `top_up` for the next | pass |
| Unit: a future date, a missing reference and a repeated reference are each rejected | pass |
| Unit: Rs 30,000 by cash sets the flag; Rs 30,000 by bank transfer does not | pass |
| DB: an agent or Team Lead cannot set `status` to `verified` (directly or through the function) | pass |
| DB: an Admin cannot verify a deposit they recorded | pass |
| DB: verification fails while KYC is not `approved` | pass |
| DB: verifying inserts exactly one `feed_events` row, and the table has no lead column | pass |
| DB: after the lead moves to another team, the deposit's `team_id` is unchanged | pass |
| DB: an analyst cannot read deposits (deferred from Module 6) | pass |
| DB: another team's agent sees none; the Team Lead sees their team's | pass |
| DB: reject and reverse need a reason; a reversed deposit is in no verified total | pass |
| E2E: agent records, Admin verifies, the lead shows `deposit_verified`, and three people are notified | pass |
| E2E: a top-up on a verified client adds a second deposit and leaves the stage alone | pass |
| E2E: reject returns the lead to documents with the reason; a repeated reference is refused; cash warns | pass |
| E2E: reversing lowers the lead's verified total | pass |
| E2E: analysts and agents cannot open the deposits screen | pass |
| E2E: Done when, new lead to verified deposit through the screens in one spec | pass |

Totals: lint and typecheck clean, 106 unit and integration tests, 217 database tests, 66 browser tests passing.

One earlier browser test (Module 7, "Record a deposit" stays disabled) needed its locator scoped to the Documents
panel, because the lead page now has a second, equally disabled button of the same name in the side card. The
behaviour it checks is unchanged.

### Done when

- [x] The full path from a new lead to a verified deposit works end to end in one Playwright spec. The Arena step of
  the golden path is added in Module 9, when the Arena exists.

### Decisions to confirm

- **A rejected deposit frees its reference number**, so a typing mistake can be re-entered. Pending, verified and
  reversed deposits keep theirs.
- **A deposit's type is `first` when the client has no pending or verified deposit** (so a first deposit that was
  rejected or reversed makes the next one a first again). It is set again at verification: the client's first
  verified deposit is `first`.
- **Reversing never moves the lead's stage.** A client whose only deposit is reversed stays `deposit_verified`;
  money totals are what change. Say if a reversal should reopen the lead.
- **`reversal_window_days`** is applied by the boards in Module 9, not here: a reversal is always allowed, and the
  board decides whether it comes off based on the days since verification.
- **"Name match"** from the original spec is replaced by showing the client's KYC bank and masked IBAN beside the
  deposit, plus the "matches the statement" tick, because no payer name is stored.

## Module 9: leaderboards and the Arena

Status: ready for review.

### Built

- Migration `20261008100000_boards.sql`:
  - `team_prizes` (one prize per team per month, past months locked, Admin and Superadmin write, everyone reads).
  - `rank_snapshots` and `take_rank_snapshot()`, run nightly at 23:55 Karachi by pg_cron. They power the rank arrows.
  - `board_teams`, `board_agents`, `board_my_team`, `board_analysts` and `arena_month_strip`: security definer
    functions that return totals only (no lead id, client name or phone). Every signed-in role may call them.
  - Only `verified` deposits count. A reversed deposit is not verified, so it leaves every board at once. Ties go to
    whoever reached the total first (the latest `verified_at` that makes it up).
  - `agent_streak`: consecutive working days (Monday to Friday, Karachi) with no missed follow-up, counted from the
    day the agent joined.
- The Arena (`/arena`) in its own dark purple layout with no sidebar: team race (one slanted lane per team with the Team
  Lead's photo, total, percentage of target, and the team's prize), top agents with rank arrows and streaks, live feed,
  top analysts, month strip, a sticky "You" bar (agents, Team Leads and analysts; Admins do not get it), period
  switch, and three tabs on narrow windows. Lanes fill from zero when the page opens.
- Live: a verified deposit reaches every open Arena over Realtime, the lane surges, the amount counts up and 12 shards
  burst once. The page also pulls fresh numbers every 10 seconds, which is how reversals appear. With reduced motion the
  burst is never added and numbers jump.
- TV mode (`/arena?tv=1`): no menu, no period switch, no "You" bar, larger type, a Karachi clock, and the panel under the
  lanes rotating between Top agents and Top analysts every 20 seconds. The live feed stays on screen.
- Leaderboard (`/leaderboard`): Teams, Agents, My team and Analysts boards, four periods, top three cards, the ranked
  list and the viewer's row pinned below. Analysts can open only the analyst board.
- Team prizes (`/prizes`, Admin and Superadmin): a grid of prize text per team for this month and the next two, shown
  beside the target. Changes are audited with old and new text.
- A verified deposit now also pops a toast with the amount for the agent whose deposit it is.
- Bug fixed on the way: the browser's Realtime socket joined without the user's token, so row-level security hid every
  live row (the notification bell had the same fault). Both now authorise the socket first.

### Tests

| Test | Result |
| --- | --- |
| DB: board totals equal the sum of `verified` rows only (pending, rejected and reversed left out) | pass |
| DB: a top-up raises the agent's, team's and credited analyst's totals by its amount | pass |
| DB: on equal totals the earlier `verified_at` ranks first | pass |
| DB: the board functions return no column that holds a lead id, client name or phone | pass |
| DB: `board_my_team` for an agent of team A never returns team B's agents | pass |
| DB: prizes (agent refused, Admin allowed), snapshots, previous rank, streak reset on a missed follow-up | pass |
| Unit: period bounds in Karachi time, lane share, rank movement, streak threshold | pass |
| E2E: `/arena` is dark purple from top to bottom at 1024, 1440 and 1920 px, gradient ends are both purple tokens | pass |
| E2E: Admin verifies in one browser, the Arena in another shows the new total, feed row and "You" bar within 5 seconds, with the burst | pass |
| E2E: all four lanes visible without scrolling at 1920 by 1080 in TV mode, no menu | pass |
| E2E: TV mode switches board after 20 seconds, and back after 40 | pass |
| E2E: with reduced motion on, no burst element is added | pass |
| E2E: an analyst can open `/arena` but gets "No access" on the team and agent boards | pass |
| E2E: reversing a deposit lowers the team total on the Arena | pass |
| E2E: an Admin sets a prize, it shows on the lane and is audited; the leaderboard shows teams, agents, my team | pass |

Totals: lint and typecheck clean, 118 unit and integration tests, 242 database tests, 75 browser tests passing.

### Done when

- [x] The Arena runs full screen on a TV and on every laptop, and is purple from top to bottom. (It needs a real day on
  the office TV to be sure; the tests cover the layout and the live updates.)

### Decisions to confirm

- **Working days for streaks are Monday to Friday.** Say if the floor works Saturdays.
- **The Arena shows at most six teams** (one per team colour). A team with no deposits sorts by name among the quiet ones.
- **Reversals always come off the boards.** The `reversal_window_days` setting is not used by the boards. If a reversal after
  those days should stay counted, say so and it becomes a one-line change.
- **The live feed is a log of verifications.** A reversed deposit leaves the totals but its feed row stays, because feed rows
  carry no link to a deposit by design.
- **Feed amounts use a lighter green (`--tl-win-on-dark`)** because the normal win green is too dark to read on the Arena purple.
- **The Arena opens as its own page** (no sidebar). "Back to the CRM" in its header returns to the role's home page.

### Left for later

- TV chime toggle (sound is off by default per the design, and not built yet).
- The 400 ms swap when two ranks trade places (rows re-order instantly for now).
- The prize on each team's **dashboard** arrives with the dashboards in Module 10.
- `tests/e2e/deposits.spec.ts` still carries its own copy of the client helper that now lives in `helpers/deposits.ts`.

### Housekeeping

- Docker was stopped when this module began; I restarted it and reset the local database to apply the new migration.
  Recreate a local Superadmin with `pnpm superadmin:create you@example.com "Your Name"`.


## Module 10: dashboards, notifications and profile

Status: ready for review.

### Built

- Migration `20261008110000_dashboards.sql`: `team_overview`, `work_queue` and `company_dashboard`. Each checks the
  caller's role inside the database and returns counts and totals only. A Team Lead always gets their own team,
  whatever team is named; an Admin names the team; only the Superadmin opens the company dashboard.
- **Team dashboard** (`/team`, Team Lead): banner with rank, verified total, percentage of target, progress bar and
  the team's prize; four tiles (new funded clients, calls today, overdue follow-ups, waiting for an agent); agent
  table (open leads, calls today, overdue, verified this month, streak); stage strip; unassigned and returned lists.
  The total and rank come from `board_teams`, the function the Arena uses, so they always match.
- **Work queue** (`/work-queue`, Admin): tiles for Deposits to verify, Documents to review and Leads waiting for a team,
  each with the age of the oldest item. They turn amber at 12 hours and red at 24, and say "overdue" in words. Below
  are "Needs a look" (cash above the limit, referrals without a date, Invalid marks waiting, returned leads without an
  agent, first calls missed) and a Today strip.
- **Company dashboard** (`/dashboard`, Superadmin): headline row, team ranking, funnel, by source, by broker, live feed
  and an attention panel, with a Today / This week / This month / All time switch.
- **Notifications** (`/notifications`): All and Unread tabs, Mark all as read, and each item opens the lead or deposit it is
  about and marks itself read.
- Every count is a link to the list or board behind it. The profile screen already existed from Module 1.

### Tests

| Test | Result |
| --- | --- |
| Unit: tile colour is plain under 12 hours, amber from 12, red from 24, never coloured when empty | pass |
| DB: a Team Lead's dashboard returns only their team and agents, even when another team is named | pass |
| DB: the work queue tiles equal direct counts; a Team Lead and an agent cannot open it | pass |
| DB: only the Superadmin opens the company dashboard; its headline and by-source money are verified-only | pass |
| E2E: the Team dashboard total equals that team's Arena total, and shows only its own agents | pass |
| E2E: a deposit pending for 25 hours turns the "Deposits to verify" tile red | pass |
| E2E: tapping a notification opens the lead and marks it read; Mark all as read | pass |
| E2E: all five roles land on a finished home screen | pass |

Totals: lint and typecheck clean, 123 unit and integration tests, 260 database tests, 79 browser tests passing.

### Done when

- [x] Each of the five roles has a finished home screen.

### Decisions to confirm

- The BUILD file does not say what the three Work queue tiles are; I chose Deposits to verify, Documents to review and
  Leads waiting for a team. The first-call, referral and Invalid alerts sit under "Needs a look".
- The funnel counts leads that **moved into** each step during the period (flow), not a snapshot of where they are now.
- "Integration: each tile equals a direct count" is covered by the database tests, which compare each tile with a direct query.
- The Team dashboard is always for the current month, to match its target and prize.


## Module 11: reports, exports and the audit log

Status: ready for review.

### Built

- Migration `20261008120000_reports.sql`: `report_data` (seven reports, each filtered by period, team and broker),
  `export_data`, the `export_history` table and `audit_actions`. Admin and Superadmin only, checked in the database.
- **Reports** (`/reports`): Funnel, Source performance, Agent activity, Deposits, Analyst sessions, Aging and Quality.
  Each is a bar chart with the table behind it, and period, team and broker filters. Money is verified-only, and the
  Deposits report matches the boards for the same period.
- **Exports** (`/exports`): leads, calls or deposits for a period and team, as a spreadsheet-safe CSV (cells that begin
  like a formula are defused). A history table lists every export. Row limit 20,000.
- CNIC and IBAN appear only in the Superadmin's leads export, and only when the Superadmin ticks the box. An Admin who
  asks for them is refused by the database. KYC documents are not stored, so none can be exported.
- Every export writes one history row and one audit row (kind, dates, team, row count, whether sensitive columns were
  included) in the same database call as the export.
- **Audit log** (`/audit-log`, Superadmin): filter by user, action and date; newest first, 50 per page; read-only (no
  edit or delete control; the table itself refuses updates and deletes).

### Tests

| Test | Result |
| --- | --- |
| Unit: Admin columns exclude CNIC and IBAN, the Superadmin's include them; formulas are defused; filters ignore bad values | pass |
| DB: Team Lead, agent and analyst cannot export or open reports | pass |
| DB: an Admin cannot ask for CNIC or IBAN; their export carries none; the Superadmin's does | pass |
| DB: each export adds one history row and one audit row, with the row count and sensitive flag | pass |
| DB: the Deposits report total equals the boards summed for the same period (verified only) | pass |
| DB: by source and by broker, pending deposits are left out | pass |
| E2E: the owners can answer "which source brings the deposits?", and all seven reports open | pass |
| E2E: an Admin export has no CNIC or IBAN, a Superadmin export can; each adds a history row and an audit row | pass |
| E2E: the audit log filters by user and by action and has no edit or delete control | pass |
| E2E: Team Leads and Admins are kept out of reports, exports and the audit log as appropriate | pass |

Totals: lint and typecheck clean, 128 unit and integration tests, 276 database tests, 83 browser tests passing.
The BUILD file lists the Deposits report vs `board_teams` as an integration test; it is covered by the database test above.

### Done when

- [x] The owners can answer "which source brings the deposits?" from the Reports screen.

### Decisions to confirm

- Phone numbers in exports begin with `+`, so the CSV writer prefixes them with an apostrophe to stop spreadsheets
  running them as formulas. They show as `'+92...`. Say if you would rather have plain numbers in the phone column.
- Exports cover "recorded in the period" for leads (added), calls (logged) and deposits (recorded), not verified date.
- The audit-log page shows the first 50 entries per page and offers Newer and Older links.

### Housekeeping

- I sped up the Agent activity report (it slowed down with many test agents), which meant editing the new migration, so
  the local database was reset again. Recreate a local Superadmin with `pnpm superadmin:create you@example.com "Your Name"`.


## Module 12: hardening and launch

Status: ready for review. This is the last module.

### Built

- **Demo seed** (`pnpm seed:demo`): 1 Superadmin, 1 Admin, 4 teams (Falcons, Markhors, Shaheens, Leopards) each with a Team
  Lead and 2 agents, 2 analysts, 2 brokers, 200 leads across every stage, KYC, sessions, calls, follow-ups, targets and
  prizes, and a month of deposits (verified, pending, rejected and reversed) with feed rows. Local databases only: it
  refuses any other host, and does nothing if already seeded. The shared password is generated into
  `.seed-credentials.local` (git-ignored) and never printed.
- **Installable app:** web manifest (theme and background `#220B47`), icons made from the logo on brand purple
  (192, 512, maskable and Apple touch), and a small service worker that only serves the offline page.
- **Pages:** themed Page not found, Something went wrong (and a last-resort global one) and You are offline. "No access" already existed.
- **README:** local setup, demo data, checks, environment variables, deployment, backup and restore, security notes.
- **Scripts:** `pnpm seed:demo`, `pnpm icons`, `pnpm audit:ci`.

### Tests

| Test | Result |
| --- | --- |
| DB: fails if any table in `public` has row-level security off (and the anonymous role holds no table privileges) | pass |
| E2E role matrix: all five roles against every fixed route give the access in BUILD.md section 3, with no placeholder or error page on open screens | pass |
| E2E: every screen passes the white and purple check; the Arena passes its dark purple check; the 404 page too | pass |
| E2E: sign-in, forgot-password and offline are white and purple and open signed out; the logo sits on brand purple | pass |
| E2E: manifest, icons and service worker; the offline page appears when the network drops | pass |
| E2E: no service-role key or its variable name appears in any browser bundle | pass |
| E2E golden path: add lead, distribute, assign, call, refer, session, documents, approve, deposit, verify, and the Arena shows the win without naming the client | pass |
| Performance: Today's calls (150 open leads) and the Arena interactive in under 2.5 s at 4x CPU slowdown | pass (about 1 to 2 s) |
| Security: `pnpm audit` on production dependencies | pass, no known vulnerabilities |

Totals: lint and typecheck clean, 128 unit and integration tests, 279 database tests, 95 browser tests passing.

### Clean-copy check

I copied the project without `node_modules`, `.next` or secrets into a fresh folder and ran `pnpm install --frozen-lockfile`,
lint, typecheck, the unit tests, the audit and a production build. All passed. I could not repeat the database and browser
tests in the copy because they use this machine's single local Supabase stack; they are green here on the same sources.

### Done when

- [x] Checks are green from a clean copy following the README (install, lint, typecheck, unit tests, audit, build; database and browser tests on the local stack).

### Open items for you

- **`pnpm audit` (all dependencies) reports one high issue:** `braces` (a denial-of-service through deeply nested patterns)
  inside ESLint's tooling (`eslint-config-next`). It is a development tool, never part of the running app, and no patched
  version exists. `pnpm audit:ci` therefore checks production dependencies only, which are clean. Tell me if you want it
  listed as an accepted exception instead.
- **Rehearse a restore** before real data goes in (README, Backup and restore).
- **Today's calls** reached interactive in about 1.2 s on a quiet machine and 2.1 s on the demo data; the budget is 2.5 s.
- The demo's names clashed with two test fixtures (a team name and the Admin's name). I renamed the fixtures in the Module 1
  database test and the demo Admin, not any app behaviour.

## Module 13: interest level and contact tracking

Built 12 Oct 2026. Modules 13 to 16 were added to `BUILD.md` first (owner request).

### What was built

- **Migration `20261012000000_interest_contact.sql`:** `leads.temperature` (hot, warm, cold), `leads.last_contacted_at`, `leads.last_contact_channel`; `activities.type` accepts `message` and `email`; a trigger stamps the lead on every call, WhatsApp, message or email; existing leads were backfilled from their calls and WhatsApp taps.
- **Server:** `set_lead_temperature` and `log_contact` (security definer, same `can_work_lead` access check as calls; each writes the timeline and the audit log). Actions `setInterest` and `logContact`; `logCall` also saves an interest level picked in the sheet.
- **Rule in `lib/leads/contact.ts`:** calendar days in Karachi time since the last contact; 0 to 3 green, 4 to 7 yellow, 8 or more red, never contacted grey.
- **Lead page:** Willingness (Hot, Warm, Cold) drop-down, contact chip ("2d ago · WhatsApp"), "Log a message" sheet. The Log a call sheet has the Hot, Warm, Cold buttons.
- **All leads (Admin, Superadmin):** Interest and Last contact columns; filters for Interest, Contacted by and Last contact; saved views "Hot leads" and "Not contacted for 8+ days".

### Decisions to confirm

- The contact time is the server's time at save, never typed in, because `BUILD.md` rule 5 says activities cannot be backdated.
- A call counts as contact whatever its outcome (including No answer). A note does not.
- Green and yellow are used for freshness, which `DESIGN.md` reserved for verified money; the exception is written into `DESIGN.md` section 3.
- Labels on the lead page say "Willingness" so they do not clash with the analyst session form's "Interest" field.

### Tests

| Test | Result |
| --- | --- |
| Unit: freshness at 0, 3, 4, 7, 8 days, Karachi calendar days, list bounds agree with the colour rule | pass |
| DB: set, change and repeat an interest level; invalid value; other agent's lead refused; Team Lead allowed; signed out refused | pass |
| DB: contact stamps channel and server time; newest wins; unknown channel and other agent's lead refused; calls stamp; notes do not | pass |
| E2E: agent sets Hot, logs a WhatsApp, chip is green; day 5 yellow, day 9 red; other agent's lead refused | pass |
| E2E: Admin filters All leads by interest, contact type and last contact | pass |

Totals: lint and typecheck clean, 133 unit tests, 304 database tests, 99 browser tests passing.

### Done when

- [x] The owner can ask "which hot leads have gone cold on contact?" in two clicks (Hot leads view, then Last contact filter).

### Open items for you

- Modules 14 to 16 (owner view with reassign and soft delete, agents adding their own leads, activity log) are written in `BUILD.md` and not started.
- Not yet shown on the agent's pipeline or Today's calls cards, only on the lead page and All leads.

## Fix round 1: international phone numbers and test-board fixes

Status: **ready for review**. Plan and root causes are in `PLAN.md`.

### Built

- **Any international phone number.** Leads and staff can have a number from any country. Numbers are stored as E.164
  (`+`, 8 to 15 digits). With no `+` or `00` a number is read as Pakistani, as before, and Pakistani landlines
  (`051 2220003`, `021 34567890`) are now accepted. Foreign numbers are shown as `+1 415 555 0100`. The same number
  written two ways (`+1 415...` and `001 415...`) is caught as a duplicate. Search finds foreign numbers with or
  without the `+`. No new dependency: only the shape is checked, not whether a foreign number is reachable.
  Migration `20261020000000_international_phones.sql` widens the check on `leads.phone` and `profiles.phone`.
- **Error messages were hidden (O4, O5, O6, O9, O12).** Drawers are modal dialogs, which sit above any `z-index`, so
  every error toast was drawn behind the open drawer. Toasts now live in the browser's top layer, and the Users and
  Teams drawers also show the error inside the drawer. Failed saves no longer wipe what the person typed.
- **Invite email only after the checks (O4).** A repeated email or phone is found before the invite is sent, so no
  email goes to someone who was never added. A repeated staff phone shows under the Phone box (O6).
- **Sign-out and email links (O1).** Redirects use the address the visitor typed, not the address the server listens
  on. This was the "site cannot be reached" on sign-out.
- **Referral alert (A15).** The logic was right but only ran from a 15-minute database timer. The timer is now every
  5 minutes and the check also runs when anyone opens a page (at most once a minute). Never a second alert.
- **People list over 1,000 rows.** The list read everything in one request and the API caps that at 1,000, so people
  silently dropped off. It now reads in pages.
- **Test board.** O4, O6, O9, O22, A8, A15 rewritten; new cards O22b and O22c for foreign numbers.

### Tests

| Test | Result |
| --- | --- |
| Unit: Pakistani mobiles and landlines, US/UK/UAE/German/Irish numbers, two spellings equal, 13 rejects, display format | pass |
| Unit: redirect origin from Host and forwarded headers; sweep runs at most once a minute and never breaks a page | pass |
| DB: foreign lead accepted, 16 digits and a short `+92` refused | pass |
| DB: referral sweep alerts every active Admin and the Superadmin once, not disabled Admins, not booked or fresh referrals, respects the setting | pass |
| E2E: US, UK and UAE leads by form; `001...` caught as a duplicate of `+1...`; bad number refused; landline stored | pass |
| E2E: foreign staff phone saves; repeated phone refused in the drawer and no auth user or email created | pass |
| E2E: short and repeated team names, disabling a team's lead: messages visible in the drawer | pass |
| E2E: Owner resets a password and the email reaches the inbox | pass |
| E2E: sign-out redirects to the forwarded host | pass |

Totals after resetting the local test database: lint and typecheck clean, 166 unit and integration tests, 317 database
tests, 107 browser tests passing.

### Not done, or needs you

- **O2 and O12 on the live board** still need a person with an authenticator and the real inbox. The code paths are
  tested; the manual cards stay.
- **Foreign numbers need `+` or `00`.** A bare `4155550100` is read as Pakistani. Excel drops the `+` from numeric
  cells, so import files should keep the phone column as text. Real per-country checks would need libphonenumber; not
  added without your OK.
- **Local test database was reset** (`pnpm db:reset`) because it had collected 1,100 test staff and 523 teams over many
  runs, which slowed one browser test past its timeout. It held no `@tl.test` testing accounts. Run
  `scripts/reset-test-data.bat` to load the Owner, Admin and Teams A to D again.
- The error-over-drawer fix is proven through the inline messages; I did not watch the toast itself over a drawer in a browser.


## Workspaces, demos and the QuantraPro look (24 Oct 2026)

Status: **ready for review. Database changes are not yet verified**: Docker was not running on the dev machine, so
`pnpm test:db` and `pnpm test:e2e` have not run against the new migration.

### Built

- Restyle to the QuantraPro look: tokens, Inter, deep green rail, light and dark themes with a top-bar toggle, dark green Arena. DESIGN.md and AGENTS.md updated (owner decision).
- Migration `20261024000000_workspaces.sql`: `workspaces` (plan client or trial, trial end, theme, logo), `workspace_id` on every table with a restrictive RLS policy, a row trigger that fills the workspace and blocks cross-workspace writes and writes after a demo ends, workspace-scoped views for every security-definer function, per-workspace uniqueness (lead phone, CNIC, team and broker names, deposit reference, settings), `provision_workspace`, `choose_default_crm`, `update_workspace_branding`, `workspace_requests`.
- App: `/signup` (public), `/workspace` (setup choice, requests, branding for clients), `/platform` (QuantraPro team), trial banner and demo-ended screen, workspace colours and logo in the shell and the Arena.
- Tests: `tests/unit/workspace.test.ts`, `supabase/tests/16_workspaces.test.sql`; colour constants in the e2e specs updated.

### Open items

- Run `pnpm db:start && pnpm test:db && pnpm test:e2e` and fix anything the migration broke before deploying.
- Sign-up skips email confirmation and has no rate limit or CAPTCHA. Add both before it is public.
- A new demo workspace starts empty. Seed sample data (or reuse `seed-demo`) if demos should open full.
- The only storage bucket today is public avatars (one folder per user), so nothing in storage needed a workspace rule. Revisit if KYC files or deposit proofs are added.
- "Custom site" is a request the team follows up by hand.
