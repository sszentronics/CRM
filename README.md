# Trading Labs CRM

Lead-to-deposit CRM for Trading Labs, Islamabad. What to build is in [BUILD.md](BUILD.md), how it looks is in
[DESIGN.md](DESIGN.md), and the working rules are in [AGENTS.md](AGENTS.md). Build status is in
[docs/PROGRESS.md](docs/PROGRESS.md).

It is a web app for laptop screens (it also works at 1024 px, and the Arena runs on a 1920 px TV), and it can be
installed from the browser. Stack: Next.js (App Router), TypeScript, Tailwind, Supabase (Postgres, Auth, Realtime),
Zod, Vitest, pgTAP and Playwright.

## Requirements

- Node.js 20.9 or later (developed on 24)
- pnpm 9 (`corepack enable` picks the pinned version)
- Docker Desktop, running, for the local Supabase stack

## Local setup

```bash
pnpm install
pnpm exec playwright install chromium
pnpm db:start                 # starts local Supabase in Docker and prints the keys
cp .env.example .env.local    # then paste the API URL, anon key and service role key printed above
pnpm superadmin:create you@example.com "Your Name"
pnpm dev                      # http://localhost:3000
```

Companies sign up for a 14-day demo at `/signup` and get their own workspace. `pnpm superadmin:create` makes the first Superadmin and emails a set-password link. Locally,
emails land in Mailpit at http://127.0.0.1:54324. On first sign-in the Superadmin scans a QR code with an
authenticator app; Admin and Superadmin enter a 6-digit code on every sign-in after that. The Superadmin then adds
everyone else from **Users and teams**.

### Demo data

```bash
pnpm seed:demo
```

Fills the **local** database with a demo company: 1 Superadmin, 1 Admin, 4 teams (Falcons, Markhors, Shaheens,
Leopards) with a Team Lead and 2 agents each, 2 analysts, 2 brokers, 200 leads across every stage and about a month of
deposits. It refuses to run against anything that is not `127.0.0.1` or `localhost`, and does nothing if the demo is
already there. The shared demo password is generated and written to `.seed-credentials.local` (git-ignored); it is
never printed. To start clean again, run `pnpm db:reset`.

Open `/styleguide` (Superadmin) to see every token and component.

## Checks

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:db && pnpm test:e2e && pnpm audit:ci
```

| Script | What it runs |
| --- | --- |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | Next route type generation, then `tsc --noEmit` |
| `pnpm test` | Vitest unit and integration tests in `tests/unit` and `tests/integration` |
| `pnpm test:db` | pgTAP tests in `supabase/tests`, including one that fails if any table in `public` lacks row-level security (needs `pnpm db:start`) |
| `pnpm test:e2e` | Playwright in `tests/e2e`, against a production build on port 3100. Needs `pnpm db:start`. The setup project creates local `e2e-*@tradinglabs.test` accounts. Timing tests run last, on their own. |
| `pnpm audit:ci` | `pnpm audit` for production dependencies, failing on high or critical issues |
| `pnpm icons` | Rebuilds the app icons in `public/icons` from the logo (only needed if the logo changes) |

The browser tests need a clean sign-in state for several roles at once, so they use their own test accounts and add
test data as they run. `pnpm db:reset` clears it when it piles up.

## Environment variables

See [.env.example](.env.example).

| Variable | Where it is used |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser and server. Safe to expose: row-level security protects the data. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only.** Never prefix it with `NEXT_PUBLIC_` and never import it from a client component. A browser test scans the production bundle for it on every run. |
| `SEED_PASSWORD` | Optional, for `pnpm seed:demo` only. |

## Deployment

The app is a Node server (`pnpm build`, then `pnpm start`). It can run on any Node host, for example Vercel or a small
VM. The database is a hosted Supabase project.

1. **Create the Supabase project** (choose a region close to Islamabad, and a paid plan if you want daily backups).
2. **Link and push the database:**
   ```bash
   pnpm exec supabase login
   pnpm exec supabase link --project-ref <your-project-ref>
   pnpm exec supabase db push
   ```
   This applies every file in `supabase/migrations`, which creates the tables, row-level security, functions and the
   scheduled jobs. Turn on the `pg_cron` extension in the Supabase dashboard first (Database, Extensions) if it is not
   already on.
3. **Set the auth options in the Supabase dashboard** to match `supabase/config.toml`: sign-ups off, minimum
   password length 10, and TOTP multi-factor on. Set the **Site URL** to your app's address, and add it to the
   redirect URLs. Set up an SMTP sender so invite and reset emails reach people (copy the wording from
   `supabase/templates`).
4. **Realtime:** the `notifications` and `feed_events` tables are added to the Realtime publication by the migrations.
   Check in the dashboard (Database, Replication) that both appear.
5. **Set the environment variables** on the host: the three in the table above, using the hosted project's URL, anon key
   and service role key. Mark the service role key as a secret.
6. **Build and start:** `pnpm install --frozen-lockfile && pnpm build && pnpm start`.
7. **Create the first Superadmin** from your own computer, with `.env.local` pointing at the hosted project:
   ```bash
   pnpm superadmin:create owner@yourcompany.pk "Owner Name"
   ```
   Do not run `pnpm seed:demo` against a real project. It refuses to.
8. Sign in, set up the authenticator code, then create the real teams, brokers, targets and people from the app.

## Backup and restore

- **Daily backups** are taken by Supabase on paid plans, with point-in-time recovery as an add-on. Turn them on.
- **Your own copy**, to keep off Supabase (run it nightly from a trusted machine; the connection string is in the
  dashboard under Project Settings, Database):
  ```bash
  pg_dump "$DATABASE_URL" --format=custom --file="trading-labs-$(date +%F).dump"
  ```
  Store it somewhere private and encrypted. It holds names, phone numbers and the typed KYC details.
- **Restore** into a spare, empty project, never over the live one:
  ```bash
  pg_restore --clean --if-exists --no-owner --dbname "$SPARE_DATABASE_URL" trading-labs-2026-10-09.dump
  ```
  Then point a copy of the app at the spare project and check that you can sign in and see yesterday's deposits.
  **Rehearse this once before launch**, and again after any major change. A backup you have never restored is a guess.
- The app stores no client documents, so there are no files to back up. The avatars bucket holds staff photos only.

## Security notes

- Every table has row-level security, and a database test fails if one does not.
- The service role key is used only in server code (it is created in `lib/supabase/admin.ts`, which is marked server-only) and in the scripts.
- Admin and Superadmin sessions need the second sign-in step; privileges in the database check it too.
- The audit log is append-only and readable only by the Superadmin.
- Client documents are not stored. Only the typed KYC details are, and lists show the last four digits.

## Workspaces and demos

Each company is a workspace (`workspaces` table). Trading Labs is the first client workspace and keeps its data.

- **Demo:** `/signup` creates a workspace with a 14-day trial and its owner as Superadmin (no authenticator step in demos). The owner picks the default CRM or asks for a custom site on `/workspace`. After 14 days the workspace is read-only and shows a request form. Data is kept.
- **Client:** a demo promoted by the QuantraPro team. It has no end date and gets the Branding page: company name, main colour and sidebar colour.
- **QuantraPro team:** set `PLATFORM_ADMIN_EMAILS` (comma-separated) in `.env.local`. Those people see `/platform`: every workspace, requests, "Make client" and "+7 days".
- **Isolation:** every table carries `workspace_id`; see the `20261024000000_workspaces` migration and `supabase/tests/16_workspaces.test.sql`.
