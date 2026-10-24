# Trading Labs CRM: rules for the AI agent

You are building the Trading Labs CRM. Two files in the repo root are the source of truth. Read them before writing code.

- `BUILD.md` says **what** to build, in which order, and how each module is tested.
- `DESIGN.md` says **how it looks, moves and talks**.

If the two files disagree, stop and ask. If something is not covered, ask. Do not guess business rules.

## How you work

1. Build **one module at a time**, in the order in `BUILD.md`. Never start a module early.
2. Before coding a module, post a short plan: migrations, files, tests.
3. Build in this order: database migration, RLS policies, server logic, UI, tests.
4. Write every test listed for the module. Then run the full check:
   `pnpm lint && pnpm typecheck && pnpm test && pnpm test:db && pnpm test:e2e`
5. Fix until everything is green. Tests from earlier modules must stay green too.
6. Update `docs/PROGRESS.md`: what was built, test results, anything left open.
7. **Stop.** Tell the user the module is ready for review. Wait for "next module".

## Things you never do

- Never skip, delete, weaken or mock away a failing test to get to green.
- Never put a permission check only in the UI. Every table has RLS. Every write is checked on the server.
- Never count a deposit that is not `verified`.
- Never show a client's name on a leaderboard, the Arena, or the live feed.
- Never expose a KYC file by public URL. Signed URLs only, 5 minutes at most.
- Never break the QuantraPro theme: neutral page, white surfaces, deep green rail and one green accent, in light and dark. Logos only sit on the rail. The Arena is always the dark green page. Only a client workspace may change `--tl-primary` and `--tl-brand`, through `lib/workspace/theme.ts`. See `DESIGN.md`.
- Never read or write another workspace's rows. Every table has `workspace_id`, a restrictive RLS policy and a write trigger. New tables follow the same pattern, and server code that uses the service role must name the workspace.
- Never write UI copy that promises profit, returns or "guaranteed" anything.
- Never change the stack, add a paid service, or add a large dependency without asking.
- Never commit secrets. Use `.env.local` and keep `.env.example` up to date.

## Quick facts

- Stack: Next.js (App Router), TypeScript strict, Tailwind, shadcn/ui, Supabase (Postgres, Auth, Storage, Realtime), Zod, Vitest, Playwright.
- Roles: `superadmin`, `admin`, `team_lead`, `agent`, `analyst`.
- Money: whole rupees as integers, shown as `Rs 250,000`.
- Phones: stored as `+92XXXXXXXXXX`, unique.
- Time: stored in UTC, shown in `Asia/Karachi`.
- It is a web app for laptop screens. Design at 1366 to 1440 px; every screen must also work at 1024 px with no horizontal scroll.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
