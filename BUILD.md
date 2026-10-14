# Trading Labs CRM: build plan

This file tells you what to build, in what order, and how to prove each part works. Read `AGENTS.md` for the working rules and `DESIGN.md` for the look.

## 1. The product in one minute

Trading Labs is a brokerage firm in Islamabad. It places clients with PSX and PMEX brokers, plus other brokers the owner adds. This CRM takes a lead from first call to a verified deposit, and makes the sales teams compete on verified deposits.

The flow:

1. The Superadmin adds leads from social media and PR.
2. The Admin hands leads to teams. Each Team Lead hands them to agents and also works leads personally.
3. Agents call, classify the lead, and book follow-ups.
4. Optionally, the agent refers an interested client to a Technical Analyst for a session. The analyst is credited if that client later deposits.
5. When the client agrees, the agent collects KYC documents.
6. The agent records the deposit. The Admin verifies it against proof.
7. Verified deposits, first and top-up, score on the leaderboards and on **the Arena**, a shared page everyone can see.

Launch size: 4 teams, each with 1 Team Lead and 2 agents, about 200 leads a month.

## 2. Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| App | Next.js, App Router, TypeScript strict | Server components by default. Server actions for writes. |
| UI | Tailwind CSS, shadcn/ui | Restyled with the white and purple tokens in `DESIGN.md`. |
| Database | Supabase Postgres | Row-level security on every table. Migrations in `supabase/migrations`. |
| Auth | Supabase Auth | Email and password. TOTP second step for `admin` and `superadmin`. |
| Files | Supabase Storage | One private bucket `kyc`, one private bucket `proofs`, one public bucket `avatars`. |
| Live updates | Supabase Realtime | Used by the leaderboard, the Arena and notifications. |
| Validation | Zod | One schema per form, shared by client and server. |
| Tests | Vitest, pgTAP via `supabase test db`, Playwright | Unit, database and RLS, end to end. |
| Package manager | pnpm | Scripts: `lint`, `typecheck`, `test`, `test:db`, `test:e2e`. |

Use the latest stable version of each tool and pin it in `package.json`. Local development runs against a local Supabase started with the Supabase CLI.

### Folder layout

```
app/
  (auth)/login/
  (app)/                  authenticated shell, one folder per screen
  (app)/arena/            the shared leaderboard page
components/ui/            base components from DESIGN.md
components/features/      one folder per module
lib/
  auth/                   session, role helpers, permission checks
  leads/stage-machine.ts  the only place stage changes are decided
  format/                 money, phone, dates, masking
  audit.ts                logAudit()
supabase/
  migrations/
  seed.sql
  tests/                  pgTAP tests, one file per module
tests/unit/
tests/e2e/                one spec per module, plus golden-path.spec.ts
docs/PROGRESS.md
public/brand/tl-logo.png  white TL logo, supplied by the client
```

## 3. Roles and permissions

| Action | superadmin | admin | team_lead | agent | analyst |
| --- | --- | --- | --- | --- | --- |
| Add or import leads | yes | yes | no | no | no |
| Assign leads to teams | yes | yes | no | no | no |
| Assign leads to agents | yes | yes | own team | no | no |
| View leads | all | all | own team | own only | referred only |
| Log calls and follow-ups | yes | yes | own team | own only | referred only |
| Refer to Technical Analysis | yes | yes | own team | own only | no |
| Record session outcome | yes | yes | no | no | yes |
| Upload and view KYC documents | yes | yes | own team | own only | no |
| Record a deposit | yes | yes | own team | own only | no |
| Verify, reject or reverse a deposit | yes | yes | no | no | no |
| Move a lead to another team | yes | yes | no | no | no |
| See the Arena | yes | yes | yes | yes | yes |
| See team and agent boards | yes | yes | yes | yes | no |
| See the analyst board | yes | yes | no | no | yes |
| Export data | yes | yes | no | no | no |
| Manage teams, Team Leads and agents | yes | yes | no | no | no |
| Manage Admins, analysts, brokers, targets, settings | yes | no | no | no | no |
| Set a team's monthly prize | yes | yes | no | no | no |
| Read the audit log | yes | no | no | no | no |

"Own team" for a Team Lead means leads whose `team_id` is their team. "Own only" means `agent_id` is the user. "Referred only" means the lead has an open session assigned to that analyst.

## 4. Lead stages

Stage is a Postgres enum. All changes go through `lib/leads/stage-machine.ts` on the server.

| Stage | Meaning | Allowed next stages |
| --- | --- | --- |
| `new` | In the pool, no team | `assigned` |
| `assigned` | Has a team. Has an agent once the Team Lead assigns it. | `no_answer`, `follow_up`, `interested`, `not_interested`, `invalid` |
| `no_answer` | Called, not reached | `no_answer`, `follow_up`, `interested`, `not_interested`, `invalid` |
| `follow_up` | Reached, call back later | `no_answer`, `follow_up`, `interested`, `not_interested`, `invalid` |
| `interested` | Wants to know more | `with_analyst`, `documents_pending`, `follow_up`, `not_interested` |
| `with_analyst` | Referred for a session (optional step) | `post_session`, `interested` |
| `post_session` | Session attended, agent is closing | `documents_pending`, `with_analyst`, `not_interested` |
| `documents_pending` | Client agreed, KYC in progress | `deposit_recorded`, `not_interested` |
| `deposit_recorded` | Agent entered a deposit, waiting for Admin | `deposit_verified`, `documents_pending` |
| `deposit_verified` | Admin confirmed the first deposit | none. Top-ups add deposits without a stage change. |
| `not_interested` | Closed with a reason | `new`, by Admin only, after the cooling-off period |
| `invalid` | Wrong number, duplicate or fake | `follow_up`, when the Team Lead rejects the mark |

Rules the stage machine enforces:

- A lead in `assigned` through `documents_pending` must have `next_follow_up_at` set, or the save fails.
- `not_interested` and `invalid` require a reason.
- `invalid` needs the Team Lead to confirm. Until then it shows as "waiting for confirmation".
- `documents_pending` to `deposit_recorded` needs every checklist item uploaded and every KYC field filled.
- After the maximum number of `no_answer` outcomes, the lead keeps its team, loses its agent, and is flagged `returned_to_lead`.
- Every transition writes one `activities` row and one `audit_log` row.

## 5. Data model

All tables have `id uuid primary key default gen_random_uuid()` and `created_at timestamptz default now()` unless noted. Money columns are `bigint` in whole rupees.

| Table | Columns | Notes |
| --- | --- | --- |
| `profiles` | `id` (same as `auth.users.id`), `full_name`, `phone`, `email`, `role`, `team_id`, `photo_url`, `is_active` | Never deleted. `profiles_public` view exposes only id, name, photo, role, team. |
| `teams` | `name`, `team_lead_id` unique, `color`, `is_active` | `color` is one of the team colours in `DESIGN.md`. |
| `targets` | `team_id`, `month` (first day of month), `amount_pkr` | Unique on (`team_id`, `month`). |
| `brokers` | `name`, `market` (`psx`, `pmex`, `other`), `kyc_checklist` jsonb, `is_active` | Checklist lists required document types. |
| `settings` | `key` primary key, `value` jsonb, `updated_by`, `updated_at` | Seeded with the defaults in section 6. |
| `leads` | `full_name`, `phone` unique, `city`, `source`, `campaign`, `notes`, `stage`, `team_id`, `agent_id`, `next_follow_up_at`, `no_answer_count`, `close_reason`, `invalid_confirmed_by`, `returned_to_lead`, `credited_analyst_id`, `agent_assigned_at`, `last_activity_at`, `created_by` | The centre of the model. |
| `assignments` | `lead_id`, `from_user`, `to_user`, `from_team`, `to_team`, `assigned_by`, `reason` | Append-only. |
| `activities` | `lead_id`, `user_id`, `type` (`call`, `whatsapp`, `note`, `stage_change`, `system`), `outcome`, `notes` | Append-only. The timeline. |
| `follow_ups` | `lead_id`, `agent_id`, `due_at`, `done_at`, `status` (`open`, `done`, `missed`) | Drives Today's calls. |
| `sessions` | `lead_id`, `analyst_id` nullable, `referred_by`, `referral_note`, `preferred_at`, `scheduled_at`, `mode` (`office`, `video`, `phone`), `outcome` (`attended`, `no_show`, `rescheduled`), `client_level`, `interest_level`, `notes`, `next_step`, `handed_back_at` | `analyst_id` null means "any available". |
| `kyc_profiles` | `lead_id` unique, `broker_id`, `cnic_number` unique, `cnic_expiry`, `mother_name`, `email`, `bank_name`, `iban`, `income_band`, `sim_in_own_name`, `consent_at`, `risk_level`, `is_pep`, `status` (`incomplete`, `submitted`, `approved`) | |
| `documents` | `kyc_profile_id`, `type`, `storage_path`, `status` (`uploaded`, `approved`, `rejected`), `reviewed_by`, `reject_reason` | Files live in the private `kyc` bucket. |
| `deposits` | `lead_id`, `broker_id`, `type` (`first`, `top_up`), `agent_id`, `team_id`, `credited_analyst_id`, `amount_pkr`, `deposit_date`, `method`, `reference_no` unique, `proof_path`, `cash_flag`, `status` (`pending`, `verified`, `rejected`, `reversed`), `verified_by`, `verified_at`, `reject_reason`, `created_by` | `team_id` is copied at insert and never changes. |
| `feed_events` | `kind`, `team_id`, `agent_id`, `amount_pkr` | Written by a trigger when a deposit becomes `verified`. No lead reference. Realtime on. |
| `rank_snapshots` | `board`, `subject_id`, `rank`, `total_pkr`, `snapshot_date` | Written nightly. Powers the rank arrows. |
| `notifications` | `user_id`, `type`, `message`, `link`, `read_at` | Realtime on. |
| `audit_log` | `user_id`, `action`, `entity`, `entity_id`, `meta` jsonb, `ip` | Append-only. Superadmin read only. |

Leaderboard numbers come from `security definer` SQL functions that return totals only: `board_teams(from, to)`, `board_agents(from, to)`, `board_my_team(from, to)`, `board_analysts(from, to)`. They never return a lead id or a client name.

## 6. Settings defaults

| Key | Default | Used by |
| --- | --- | --- |
| `first_call_deadline_hours` | 24 | Countdown on new leads |
| `max_call_tries` | 5 | Return of unanswered leads to the Team Lead |
| `stale_days` | 7 | "Stale" mark in pipelines |
| `cooling_off_days` | 90 | Recycling `not_interested` leads |
| `referral_deadline_hours` | 24 | Alert when a referral has no session date |
| `reversal_window_days` | 30 | Whether a reversed deposit is deducted from the board |
| `cash_flag_limit_pkr` | 25000 | Flagging cash deposits |
| `idle_signout_minutes` | 30 | Idle sign-out for Admin and Superadmin |
| `lead_sources` | Facebook, Instagram, TikTok, PR, Referral, Walk-in | Add-lead form |
| `not_interested_reasons` | Not enough money, No trust, Already has a broker, Not reachable, Other | Log a call |
| `invalid_reasons` | Wrong number, Duplicate, Fake | Log a call |

## 7. Rules that apply to every module

1. **RLS first.** Every table has RLS enabled with a default deny. Write the policies and their tests before the UI.
2. **Server-side writes.** Every write is a server action that validates with Zod, checks permission, performs the change, and calls `logAudit()`.
3. **One stage machine.** No component or action sets `leads.stage` directly.
4. **Verified only.** Totals, boards, dashboards and reports count deposits with `status = 'verified'` and nothing else.
5. **Append-only tables.** `assignments`, `activities`, `audit_log` and `feed_events` have no update or delete policy for any role.
6. **Private documents.** KYC files and deposit proofs are served through signed URLs that expire in 5 minutes or less. Each view writes an audit row.
7. **Masking.** Lists show the last 4 digits of CNIC and IBAN. Full values appear only on the lead page for roles allowed to see them.
8. **No client names in public views.** Boards, the Arena and the feed show teams, staff first names and amounts only.
9. **Nothing is hard deleted.** Users, teams, brokers and leads are switched off, never removed.
10. **White and purple.** Every app route renders on the light page with the purple sidebar from `DESIGN.md`. The Arena is the one dark purple page.
11. **Compliant copy.** No text promises profit or returns. Celebrations are for staff, about verified deposits.
12. **Laptop first.** Every screen is designed for laptop screens at 1366 to 1440 px and works down to 1024 px with no horizontal scroll.

## 8. The module loop

For each module below:

1. Post a plan: migrations, RLS policies, server actions, components, tests.
2. Build: migration, RLS, server logic, UI.
3. Write every test listed under **Tests**. Add more if you find gaps.
4. Run `pnpm lint && pnpm typecheck && pnpm test && pnpm test:db && pnpm test:e2e`.
5. Fix until green, including tests from earlier modules.
6. Tick the **Done when** boxes in `docs/PROGRESS.md` and note anything left open.
7. Stop and ask for review. Do not start the next module until the user says so.

Every end-to-end spec calls a shared helper `expectBrandPage(page)` (`tests/e2e/helpers/brand.ts`). It asserts that the computed `background-color` of `body` is `--tl-bg` (`rgb(247, 245, 252)`), that no full-width container in the content is dark, and that the white logo sits on brand purple (`rgb(34, 11, 71)`). Arena specs use their own dark-page check instead.

---

## Module 0: foundation and design system

**Goal:** an empty app that already looks like Trading Labs.

**Build**

- Scaffold the project, tooling and folder layout from section 2. Local Supabase running.
- Tailwind theme, CSS variables and fonts from `DESIGN.md`.
- Base components from `DESIGN.md`: Button, Card, Sheet, Input, Select, StageChip, Avatar, MoneyText, SlantBar, RankBadge, Toast, DataTable, EmptyState.
- App shell: purple sidebar with the logo and grouped menu, white top bar with search box, bell and user. Below 1024 px the menu opens from a button. Placeholder pages for each menu item.
- `/styleguide` route showing every component and every stage chip.
- Formatting helpers: `formatPKR`, `normalisePhone`, `maskTail`, `formatKarachi`.

**Tests**

- [ ] Unit: `formatPKR(250000)` returns `Rs 250,000`. `formatPKR(0)` returns `Rs 0`.
- [ ] Unit: `normalisePhone` turns `0300 1234567`, `03001234567` and `+92 300 1234567` into `+923001234567`, and rejects `12345`.
- [ ] Unit: `maskTail('3520212345671')` shows only the last 4 digits.
- [ ] E2E: `/styleguide` passes `expectBrandPage` at 1024, 1366 and 1440 px, with no horizontal scroll.
- [ ] E2E: the logo renders on the purple sidebar and has alt text "Trading Labs".
- [ ] Accessibility: axe finds no serious or critical issues on `/styleguide`. Body text contrast is at least 4.5 to 1.

**Done when**

- [ ] `pnpm build` succeeds and all checks are green.
- [ ] A person looking at `/styleguide` on a laptop sees a clean white and purple app with the TL logo.

---

## Module 1: sign-in, roles, users and teams

**Goal:** the right person lands on the right home screen, and the Superadmin can create people and teams.

**Build**

- Tables: `profiles`, `teams`, `audit_log`, with RLS. `logAudit()` helper.
- Login screen. No sign-up. Forgot password by email.
- TOTP second step for `admin` and `superadmin`. Idle sign-out for the same two roles.
- Route guard: each role is sent to its home (`/dashboard`, `/work-queue`, `/team`, `/today`, `/sessions`). Routes a role may not open return the "No access" page.
- Users and teams screen for the Superadmin: add, edit, disable, reset password, move an agent, change a Team Lead, set team colour.
- My profile screen: change photo and password, sign out.

**Rules**

- Each team has exactly one Team Lead.
- Disabling a user ends their sessions at once. Their open leads will return to the Team Lead once leads exist (wire the hook now, test it in Module 4).
- Only the Superadmin changes name, role or team.

**Tests**

- [ ] DB: RLS is enabled on `profiles`, `teams`, `audit_log`.
- [ ] DB: an `agent` cannot read another user's phone or email, but can read `profiles_public`.
- [ ] DB: nobody can update or delete an `audit_log` row. Only `superadmin` can select.
- [ ] DB: a second Team Lead on the same team is rejected.
- [ ] E2E: each of the five roles signs in and lands on its own home route.
- [ ] E2E: a disabled user cannot sign in and sees "Account disabled, contact your Admin".
- [ ] E2E: an `agent` opening `/users` gets "No access", and calling the create-user action directly is refused.
- [ ] E2E: `admin` is asked for a 6-digit code after the password.
- [ ] Unit: creating a user writes one audit row with the actor and the new user id.

**Done when**

- [ ] The Superadmin can create 4 teams with a Team Lead and 2 agents each, 2 analysts and 1 admin from the UI.

---

## Module 2: brokers, targets and settings

**Goal:** the owner's configuration exists before any lead does.

**Build**

- Tables: `brokers`, `targets`, `settings`, with RLS and seeded defaults.
- Brokers screen: table, add and edit form, on and off switch, KYC checklist editor.
- Targets screen: grid of teams by months, with a company total row and "copy last month".
- Settings screen: grouped list with edit in place for every key in section 6.

**Rules**

- Only the Superadmin writes. Everyone signed in can read active brokers and the settings their screens need.
- A broker with clients can be switched off but not removed. A checklist change applies to new clients only.
- Targets for past months are locked.
- Every change is audited with old and new value.

**Tests**

- [ ] DB: `admin`, `team_lead`, `agent`, `analyst` cannot insert or update `brokers`, `targets`, `settings`.
- [ ] DB: a target for a past month cannot be changed.
- [ ] Unit: `getSetting('max_call_tries')` returns 5 on a fresh database.
- [ ] E2E: the Superadmin adds a PSX broker and a PMEX broker, unticks one checklist item on one of them, and the change is saved.
- [ ] E2E: changing a setting writes an audit row holding the old and new value.

**Done when**

- [ ] Two brokers, this month's targets for all teams, and all default settings exist.

---

## Module 3: lead intake and search

**Goal:** leads get into the pool cleanly, with no duplicates.

**Build**

- Table: `leads`, with RLS.
- Add and import leads screen. Tab 1: single form with "Save" and "Save and add another". Tab 2: three-step import of Excel or CSV (upload, match columns, review summary), with a downloadable template and a download of skipped rows.
- Global search in the top bar by name, phone or CNIC, starting at 3 characters.

**Rules**

- Name, phone and source are required. Phone is normalised then checked for uniqueness.
- A duplicate phone is blocked with a link to the existing lead for those allowed to open it.
- Search returns only leads the user may see. A phone that exists outside the user's scope returns "Already in the system" and nothing else.
- New leads start in stage `new` with no team.

**Tests**

- [ ] DB: only `superadmin` and `admin` can insert leads.
- [ ] DB: two leads with the same normalised phone cannot exist.
- [ ] Unit: the import parser, given a file of 10 rows with 2 duplicates and 1 bad phone, reports 7 new, 2 duplicate, 1 invalid.
- [ ] E2E: importing that file adds exactly 7 leads and offers 3 skipped rows as a download.
- [ ] E2E: adding a lead with an existing phone shows the duplicate message and adds nothing.
- [ ] E2E: search for a seeded phone returns the lead for `admin`.

**Done when**

- [ ] The Superadmin can add one lead by form and 200 by file.

---

## Module 4: distribution and assignment

**Goal:** leads reach agents fairly, and everyone sees only their own.

**Build**

- Table: `assignments`, append-only. Table `notifications` and the bell with unread count.
- Lead distribution screen (Admin): pool summary by source, lead table with tick boxes, team panel, "Distribute evenly" with a preview, "Assign to team", and move between teams with a reason.
- Assign leads screen (Team Lead): unassigned team leads, agent panel with workloads, "Assign selected to", "Split evenly", and reassign with a reason. The Team Lead can assign to themselves.
- All leads screen (Admin): filter bar, table, saved views, bulk reassign.
- RLS policies on `leads` for all five roles, as in section 3.

**Rules**

- Even distribution balances both the count and the mix of sources per team. Nothing is written until the preview is confirmed.
- Assigning to an agent sets `agent_assigned_at` and starts the first-call countdown.
- Every move writes an `assignments` row and notifies the receiver.
- Disabling a user returns their open leads to the Team Lead.

**Tests**

- [ ] Unit: distributing 200 leads from 4 sources across 4 teams gives each team 50, and per-source counts differ by at most 1 between teams.
- [ ] Unit: the preview function writes nothing.
- [ ] DB: an `agent` selecting from `leads` gets only rows where `agent_id` is their id.
- [ ] DB: a `team_lead` gets only their team's rows and cannot set `team_id` to another team.
- [ ] DB: `assignments` rows cannot be updated or deleted.
- [ ] E2E: Admin distributes, Team Lead splits evenly, and each agent gets a "Lead assigned" notification.
- [ ] E2E: reassigning without a reason is blocked.
- [ ] E2E: disabling an agent moves their open leads back to the Team Lead's unassigned list.
- [ ] E2E: search by a phone in another team shows "Already in the system" to an agent.

**Done when**

- [ ] 200 seeded leads can go from the pool to 12 people in under a minute of clicking.

---

## Module 5: lead page, calls and follow-ups

**Goal:** an agent can work a full day of calls from a laptop. This is the core module. Take care with it.

**Build**

- Tables: `activities`, `follow_ups`, with RLS. The stage machine from section 4.
- Lead page: header with stage chip, contact strip with Call and WhatsApp buttons, next action bar, stage tracker, and four tabs. Timeline is live in this module. Session, Documents and Deposits tabs show a "coming soon" empty state.
- Log a call sheet: five outcome buttons, notes, follow-up quick picks and picker, reason drop-down for closed outcomes.
- Today's calls (agent and Team Lead home for own leads): count strip, Overdue, Due today, New leads.
- My pipeline and Team pipeline: columns on desktop, stage tabs on phone, filters, "Show closed", Stale mark.
- Team Lead: leave a note for the agent, confirm or reject an Invalid mark.
- A scheduled job marks missed follow-ups and sends "due soon" and "overdue" notifications.

**Rules**

- Outcome is required. A note is required for Interested and Not interested. A follow-up time is required for Interested, Follow-up and No answer.
- No answer increments `no_answer_count`. At `max_call_tries` the lead returns to the Team Lead.
- The server sets the user and time on every activity. Nothing can be backdated or edited.
- Stage buttons shown on the lead page depend on the stage, as in the table in section 4.
- Opening a lead outside your scope shows "No access".

**Tests**

- [ ] Unit: a table-driven test covers every stage pair. Allowed pairs pass, all others throw.
- [ ] Unit: saving an open stage without `next_follow_up_at` fails.
- [ ] Unit: the fifth No answer clears `agent_id` and sets `returned_to_lead`.
- [ ] DB: `activities` cannot be updated or deleted by any role.
- [ ] DB: agent B cannot read agent A's `activities` or `follow_ups`.
- [ ] E2E at 1366 px: an agent opens a lead, clicks Call, and saves a No answer in 3 clicks or fewer inside the drawer.
- [ ] E2E: an overdue follow-up appears first, in red, on Today's calls.
- [ ] E2E: marking Not interested without a reason is blocked.
- [ ] E2E: the Team Lead rejects an Invalid mark and the lead returns to `follow_up`.
- [ ] E2E: an agent pasting the URL of another team's lead sees "No access".

**Done when**

- [ ] An agent can clear a list of 15 calls from a laptop without leaving Today's calls.

---

## Module 6: analyst sessions

**Goal:** the optional hand-off to Technical Analysis works and credits the analyst.

**Build**

- Table: `sessions`, with RLS. RLS on `leads` extended for analysts.
- Refer to analyst sheet: analyst list with open session counts or "Any available", preferred time, mode, required note.
- Session tab on the lead page.
- Session queue (analyst home): count strip, New referrals, Today's sessions, Upcoming, "My credit" figure.
- Session form: client summary, date and mode, outcome, client level, interest, notes, next step, "Save and hand back".

**Rules**

- Referral moves the lead to `with_analyst`. The agent stays the owner.
- Attended moves the lead to `post_session`, sets `leads.credited_analyst_id`, and notifies the agent.
- No-show notifies the agent and keeps the lead in `with_analyst`.
- Cancelling a referral before the session returns the lead to `interested`.
- An "Any available" referral is taken by the first analyst who accepts it.
- An analyst's access to the lead ends when the outcome is saved.
- A referral with no session date after `referral_deadline_hours` alerts the Admin.

**Tests**

- [ ] DB: an analyst can read only leads with an open session assigned to them, and loses access after hand-back.
- [ ] DB: an analyst cannot read `kyc_profiles`, `documents` or `deposits`.
- [ ] DB: when two analysts accept the same "Any available" referral, exactly one succeeds.
- [ ] Unit: Attended sets the credited analyst and the stage. No-show changes neither.
- [ ] E2E: agent refers, analyst accepts and schedules, records Attended, and the agent sees the notes and a notification.
- [ ] E2E: an interested lead can go straight to documents without any referral.

**Done when**

- [ ] A lead can pass through a session and come back to the agent with notes, or skip the session entirely.

---

## Module 7: KYC documents

**Goal:** documents are collected and uploaded from a laptop and stay locked down.

**Build**

- Tables: `kyc_profiles`, `documents`, with RLS. Private `kyc` bucket with storage policies.
- Documents tab on the lead page: progress line, broker picker, checklist rows with status and upload, KYC fields, two tick boxes.
- Document review screen (Admin): queue with days waiting, image beside typed fields, approve or reject per item, "Approve all", unlock.

**Rules**

- The checklist comes from the chosen broker.
- CNIC number is 13 digits and unique. IBAN is 24 characters starting with `PK`.
- Uploads accept images and PDF up to 5 MB.
- Approved items are locked for agents. Rejecting needs a reason and notifies the agent.
- Files are reached only through signed URLs of 5 minutes or less. Each open writes an audit row.
- When every item is approved, `kyc_profiles.status` becomes `approved`.

**Tests**

- [ ] Unit: CNIC and IBAN validators accept valid values and reject wrong lengths, wrong prefixes and letters in the CNIC.
- [ ] DB: a duplicate CNIC number is rejected.
- [ ] DB and storage: an agent from another team, and any analyst, cannot read the row or fetch the file.
- [ ] Integration: a signed URL stops working after it expires.
- [ ] E2E: opening a document as Admin writes an audit row with the document id.
- [ ] E2E: an agent cannot replace an approved document.
- [ ] E2E: a rejected item shows its reason in red and appears on the agent's Today's calls.
- [ ] E2E: "Add deposit" is disabled until every item and field is complete.

**Done when**

- [ ] A full KYC set can be uploaded and reviewed from a laptop.

---

## Module 8: deposits and verification

**Goal:** money is recorded by the agent and only counts after the Admin checks it.

**Build**

- Tables: `deposits`, `feed_events`, with RLS. No proof file or bucket (verified by reference number, see section 10). Trigger that writes a `feed_events` row when a deposit becomes `verified`.
- Add deposit sheet on the lead page: broker, type, amount, date, method, reference, credited analyst shown read-only.
- Deposits tab on the lead page with the verified total.
- Deposit verification screen (Admin): Pending, Verified, Rejected tabs, queue, detail with the client's bank to compare with the statement, Verify, Reject, Ask agent, Reverse.

**Rules**

- The system sets the type: the client's first verified deposit is `first`, later ones are `top_up`.
- `team_id` and `credited_analyst_id` are copied onto the deposit at insert and never change.
- The reference number is the proof, so it is required. The date cannot be in the future. A reference number can be used once.
- Cash above `cash_flag_limit_pkr` sets `cash_flag` and warns the agent.
- A deposit cannot be verified until the client's KYC is `approved`.
- Nobody verifies a deposit they recorded.
- Verify moves the lead to `deposit_verified` if it was `deposit_recorded`, and notifies the agent, Team Lead and credited analyst.
- Reject returns a first deposit's lead to `documents_pending`, with a reason.
- Reverse needs a reason, sets status `reversed`, and removes the amount from all totals.

**Tests**

- [ ] Unit: type is `first` for the first deposit and `top_up` for the next.
- [ ] Unit: a future date, a missing reference and a repeated reference are each rejected.
- [ ] Unit: Rs 30,000 by cash sets `cash_flag`. Rs 30,000 by bank transfer does not.
- [ ] DB: an `agent` or `team_lead` cannot set `status` to `verified`.
- [ ] DB: an `admin` cannot verify a deposit where `created_by` is their own id.
- [ ] DB: verification fails while KYC is not `approved`.
- [ ] DB: verifying inserts exactly one `feed_events` row with no lead reference.
- [ ] DB: after the agent moves to another team, the deposit's `team_id` is unchanged.
- [ ] E2E: agent records, Admin verifies, the lead shows `deposit_verified`, and three people are notified.
- [ ] E2E: a top-up on a verified client adds a second deposit and leaves the stage alone.

**Done when**

- [ ] The full path from new lead to verified deposit works end to end in one Playwright spec.

---

## Module 9: leaderboards and the Arena

**Goal:** the competition is visible to everyone, live, on a dark purple page. This is the showpiece. Follow `DESIGN.md` section 8 exactly.

**Build**

- SQL functions `board_teams`, `board_agents`, `board_my_team`, `board_analysts`. Table `rank_snapshots` and its nightly job.
- Leaderboard screen: board switch, period switch (Today, This week, This month, All time), top cards, ranked list, pinned own row.
- **The Arena** at `/arena`, the shared page for every signed-in role:
  - Team race: one slanted lane per team, filling toward its target, with the Team Lead's photo, team total and percentage of target.
  - Top agents list with rank arrows and streaks.
  - Live feed of verified deposits from `feed_events` over Realtime.
  - Top analysts panel.
  - Month strip: total verified this month, new funded clients, biggest deposit this week, days left in the month.
  - A sticky "You" bar showing the viewer's rank and total.
  - TV mode at `/arena?tv=1`: full screen, no menu, larger type, rotating between Teams, Agents and Analysts every 20 seconds.
- Team prizes (owner decision, 8 Oct 2026): the Superadmin or Admin sets one prize per team per month next to the
  target, for example a team dinner or a trip for reaching the monthly target. The prize is for the whole team. It
  shows on the team's Arena lane and the team dashboard, with progress toward the target that wins it.
- Celebration when a deposit is verified: the team's lane surges, the amount counts up, and the slanted shard burst plays once.
- Streak: consecutive working days on which an agent had zero missed follow-ups.

**Rules**

- Only `verified` deposits count. First and top-up count the same.
- On a tie, whoever reached the total first ranks higher.
- No client name or lead id is ever sent to the browser for these screens.
- The Arena updates within 5 seconds of a verification, without a refresh.
- A reversed deposit leaves the boards at once.
- With `prefers-reduced-motion`, values change instantly and the burst does not play.
- The page background is the Arena gradient from `DESIGN.md`. It is purple top to bottom at every window size.

**Tests**

- [ ] DB: with seeded deposits of each status, board totals equal the sum of `verified` rows only.
- [ ] DB: a top-up raises the agent's, team's and credited analyst's totals by its amount.
- [ ] DB: on equal totals, the earlier `verified_at` ranks first.
- [ ] DB: the board functions return no column that holds a lead id, client name or phone.
- [ ] DB: `board_my_team` called by an agent of team A never returns team B's agents.
- [ ] E2E: `/arena` is dark purple at 1024 px, 1440 px and 1920 px. The gradient's top and bottom colours are both purple tokens.
- [ ] E2E: with two browsers open, Admin verifies a deposit in one and the Arena in the other shows the new total and feed row within 5 seconds, with no reload.
- [ ] E2E: all four team lanes are visible without scrolling at 1920 by 1080 in TV mode, and the menu is hidden.
- [ ] E2E: TV mode switches board after 20 seconds.
- [ ] E2E: with reduced motion on, no burst element is added to the page.
- [ ] E2E: an analyst can open `/arena` but gets "No access" on the team and agent boards of `/leaderboard`.
- [ ] E2E: reversing a deposit lowers the team total on the Arena.

**Done when**

- [ ] The Arena can run on the office TV all day and on every agent's laptop, and it is unmistakably purple.

---

## Module 10: dashboards, notifications and profile

**Goal:** each manager's home screen tells them what needs attention.

**Build**

- Team dashboard (Team Lead): banner with rank and target progress, four tiles, agent table, stage strip, unassigned and returned panels.
- Work queue (Admin): three tiles with counts and oldest age, alerts list, today strip.
- Company dashboard (Superadmin): headline row, team ranking, funnel, by source, by broker, live feed, attention panel.
- Notifications screen with All and Unread, "Mark all as read", and deep links.

**Rules**

- Every count on a dashboard is tappable and opens the list behind it.
- Work queue tiles change colour by age: amber after 12 hours, red after 24.
- All money figures are verified-only and match the boards.

**Tests**

- [ ] Integration: with seed data, each tile's number equals a direct database count.
- [ ] DB: a Team Lead's dashboard queries return only their team.
- [ ] E2E: the Team dashboard total equals that team's Arena total for the same period.
- [ ] E2E: a deposit pending for 25 hours turns the "Deposits to verify" tile red.
- [ ] E2E: tapping a notification opens the lead or deposit it refers to and marks it read.

**Done when**

- [ ] Each of the five roles has a finished home screen.

---

## Module 11: reports, exports and audit log

**Goal:** the owners can see why the numbers are what they are, and nothing leaves without a trace.

**Build**

- Reports screen with seven reports: Funnel, Source performance, Agent activity, Deposits, Analyst sessions, Aging, Quality. Each is a chart with its table and period, team and broker filters.
- Exports screen: builder for leads, calls or deposits, and a history table.
- Audit log screen: filters and a read-only table.

**Rules**

- Report deposit figures match the boards for the same period.
- Exports are for `admin` and `superadmin`. CNIC and IBAN columns appear only when the Superadmin exports. KYC files are never exported.
- Every export writes an audit row with filters and row count.

**Tests**

- [ ] Integration: the Deposits report total equals `board_teams` summed for the same period.
- [ ] DB: `team_lead`, `agent`, `analyst` cannot call the export action.
- [ ] E2E: an Admin export has no CNIC or IBAN column. A Superadmin export can include them.
- [ ] E2E: an export adds one row to the history table and one to the audit log.
- [ ] E2E: the audit log can be filtered by user and by action, and has no edit or delete control.

**Done when**

- [ ] The owners can answer "which source brings the deposits?" from the Reports screen.

---

## Module 12: hardening and launch

**Goal:** safe to put real client documents in.

**Build**

- Seed script for a demo: 1 superadmin, 1 admin, 4 teams (Falcons, Markhors, Shaheens, Leopards) with a Team Lead and 2 agents each, 2 analysts, 2 brokers, 200 leads spread across stages, and a month of deposits.
- Installable web app: manifest, icons made from the logo on purple, theme colour set to the brand purple.
- Error, "No access" and offline pages in the white and purple theme.
- `README.md`: local setup, environment variables, deployment, backup and restore steps.

**Tests**

- [ ] DB: a test queries `pg_class` and fails if any table in `public` has RLS disabled.
- [ ] E2E role matrix: every role against every route gives the result in section 3.
- [ ] E2E golden path: add lead, distribute, assign, call, refer, session, documents, approve, deposit, verify, Arena updates.
- [ ] E2E: every route in the app passes `expectBrandPage` (the Arena passes its dark-page check).
- [ ] Performance: the Arena and Today's calls reach interactive in under 2.5 seconds on a mid-range laptop profile with seed data.
- [ ] Security: no service-role key in any client bundle. `pnpm audit` shows no high or critical issue.

**Done when**

- [ ] All checks are green from a clean clone following only the README.

---

## Module 13: interest level and contact tracking

**Goal:** the owner can see how keen each lead is and how recently each lead was contacted, and filter by both.

**Build**

- Migration: `leads.temperature`, `leads.last_contacted_at`, `leads.last_contact_channel`; `activities.type` gains `message` and `email`; a trigger stamps the lead on every contact activity.
- `set_lead_temperature` and `log_contact` (security definer, `can_work_lead`), each writing the timeline and the audit log.
- Lead page: Interest drop-down (Hot, Warm, Cold), contact chip, "Log a message" sheet (WhatsApp, Message, Email). The Log a call sheet also takes an interest level.
- All leads (Admin and Superadmin): Interest and Last contact columns; filters for Interest, Contacted by and Last contact; saved views "Hot leads" and "Not contacted for 8+ days".

**Rules**

- The contact time is the server's time when saved. It cannot be backdated.
- Freshness is calendar days in Karachi time since the last contact: 0 to 3 green, 4 to 7 yellow, 8 or more red. A lead nobody has contacted shows grey "Never contacted".
- A call (any outcome), WhatsApp, message or email counts as contact. A note does not.
- Only people who can work the lead (its agent, the team's Team Lead, an Admin) set the interest level or log contact. Analysts cannot.

**Tests**

- [ ] Unit: the freshness rule at 0, 3, 4, 7 and 8 days, in Karachi calendar days.
- [ ] DB: an agent sets and changes the interest on their own lead and cannot on another agent's. Contact stamps the channel and server time. A note does not.
- [ ] E2E: an agent sets Hot and logs a WhatsApp, and the chip is green. Day 5 is yellow and day 9 is red.
- [ ] E2E: an Admin filters All leads by interest, contact type and last contact.

**Done when**

- [ ] The owner can ask "which hot leads have gone cold on contact?" in two clicks.

---

## Module 14: owner view, reassign and delete

**Goal:** the owner sees which agent and team hold which leads, and can move or remove any lead.

**Build**

- "Lead ownership" screen (Superadmin, Admin): team cards that open to agents, each with lead counts by interest and by freshness colour, and the leads with no agent.
- Reassign any lead, one or many, to any team or agent with a reason (builds on bulk reassign).
- Soft delete: Admin and Superadmin hide leads from everyone else, with a reason. A "Deleted leads" view restores them. A lead with a recorded deposit cannot be deleted.

**Tests**

- [ ] DB: only `superadmin` and `admin` can delete or restore a lead; a deleted lead disappears for agents and Team Leads.
- [ ] DB: a lead with a deposit cannot be deleted.
- [ ] E2E: an Admin reassigns three leads and deletes one, then restores it.

---

## Module 15: everyone can add their own leads

**Goal:** agents and Team Leads add leads they sourced themselves; each counts as theirs.

**Build**

- "Add my lead" form with source "Own / PR". The lead is created owned by the person adding it, in their team.
- RLS: an agent may only insert a lead whose `agent_id` is themselves and whose `team_id` is their own.
- A second attempt at a phone that exists adds nothing and says "That number is already in the system", with no owner shown. The Admin reassigns by hand.

**Tests**

- [ ] DB: an agent cannot insert a lead for another agent or team.
- [ ] E2E: an agent adds a lead and sees it as theirs; a duplicate phone adds nothing.

---

## Module 16: activity log

**Goal:** a complete record of what happened to every lead.

**Build**

- One append-only history per lead (a "History" tab) covering add or import, assignment and reassignment, delete and restore, interest changes, contacts and stage changes.
- A global "Logs" screen (Superadmin, Admin) filtered by user, team, lead, event and date, in Karachi time, exportable through Module 11.

**Tests**

- [ ] DB: nobody can update or delete log rows; each event writes exactly one row.
- [ ] DB: an agent sees only the history of leads they can see.

---

## 9. Not in version 1

Do not build these unless asked: automatic lead intake from Facebook, Instagram or TikTok forms, phone system links and call recording, reading CNIC details from the photo, WhatsApp or SMS reminders to clients, a native mobile app, commission reports, badges and monthly recap cards, Urdu.

## 10. Open questions

Answered by the owner on 8 Oct 2026:

- Staff sign in with **email and password**. Admin and Superadmin add a TOTP code.
- Phone numbers: **landlines and mobiles** are both accepted.
- Analyst credit: the analyst is **credited individually** for a referred client's verified deposits, on their own
  board, in addition to the team's credit.
- KYC documents: the six default checklist items (CNIC front, CNIC back, photo, signature, proof of income, bank
  proof) are the standard set. Proof of address, Zakat declaration and nominee CNIC stay available as optional items.
- **Client documents are not saved or hosted in the CRM.** Agreed redesign (8 Oct 2026):
  - Module 7 keeps the typed KYC fields (CNIC, expiry, mother's name, email, bank, IBAN, income band, SIM in own name,
    consent, risk level, PEP), masked to the last 4 digits in lists. Each checklist item is ticked "collected" by the
    agent and approved or rejected (with a reason) by the Admin, who checks the broker's system or the original. No
    uploads, no `kyc` bucket, no signed URLs.
  - Module 8 verifies deposits by **reference number** (bank or transaction reference, amount, date, method) matched
    against the bank or broker statement. No proof file and no `proofs` bucket.

- A deposit the client withdraws soon after is **reversed and taken off the boards** (within
  `reversal_window_days`).
- **Team prizes**: set by the Superadmin or Admin, one per team per month, won by the whole team (for example a
  dinner or trip for reaching the monthly target). Built in Module 9 next to targets. No individual commission.
- The Arena is visible to **all five roles**, including the Top analysts panel.
- The **Admin manages teams and their people**: creates and renames teams, sets colours, picks or changes Team
  Leads, and adds, edits, moves or disables Team Leads and agents. Only the Superadmin creates Admins, analysts or
  another Superadmin. (Changes the Module 1 rule that only the Superadmin manages users and teams.)

Still open (not blocking yet):

- Team names: the Admin or Superadmin creates the real teams in the app, so the seed names stay demo-only.
