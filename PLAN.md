# PLAN: international phone numbers and test-board fixes

Source: the Owner and Admin test boards (15 Oct 2026) plus the request that a lead can have **any international number**,
not only a Pakistani one. This is a fix round on the finished modules 0 to 12, not a new module. Work through the
items in order. `docs/PROGRESS.md` gets a "Fix round 1" entry at the end.

## 1. Feature: any international phone number

**Rule (one place, `lib/format/phone.ts`).** A phone is stored in E.164: `+` then 8 to 15 digits, first digit 1 to 9.

| Typed | Stored |
| --- | --- |
| `0300 1234567`, `300-1234567`, `+92 300 1234567`, `0092 300 1234567` | `+923001234567` (as today) |
| Pakistani landline `051 2220003`, `021 34567890`, `0423 1234567` | `+92512220003`, `+922134567890`, `+9242312345 67` (leading 0 dropped) |
| `+1 415 555 0100`, `+44 7911 123456`, `+971 50 123 4567`, `00971501234567` | `+14155550100`, `+447911123456`, `+971501234567`, `+971501234567` |
| `12345`, `0300 12345`, `+1`, letters, 16+ digits | refused |

- A number with no `+` or `00` is read as Pakistani. To enter a foreign number, start with `+` or `00`.
- No new dependency (no libphonenumber). Length and shape checks only; we do not claim a foreign number is *reachable*.
- Display: Pakistani mobiles stay `0300 1234567`; everything else shows `+1 415 555 0100` style (country code, then groups).
- Duplicate check works across spellings, as before (`+1 415...` and `001 415...` are one number).

**Where it changes**
- `lib/format/phone.ts`: `normalisePhone`, `formatPhone` (+ `phoneCountry` helper for the label).
- `lib/leads/validate.ts`, `lib/users/schemas.ts`: new error text ("Enter a full phone number. Foreign numbers start with + and the country code.").
- Migration `20261020000000_international_phones.sql`: replace the `^\+92[1-9][0-9]{9}$` check on `leads.phone` and
  `profiles.phone` with `^\+[1-9][0-9]{7,14}$`. Existing rows already satisfy it. Re-check any view, function or
  trigger that assumes `+92` (grep shows none besides the two checks).
- UI copy and placeholders: Add leads, import wizard help text, template file, person drawer, search box (search must
  normalise foreign numbers too), `docs/testing/test-board.html`.
- Staff phones (Users) use the same rule, so a staff member abroad is allowed.

**Tests**
- Unit (`tests/unit/format.test.ts`, `lead-import.test.ts`): every row of the table above, plus duplicate detection
  between `+14155550100` and `0014155550100`, plus the old rejects that must still be rejected.
- pgTAP (`04_leads`, `01_users_teams`): a `+1...` lead inserts; `12345` and a 16-digit number are refused; duplicate refused.
- E2E (`leads.spec.ts`): add a US lead by hand, a UK lead by import, see both on All leads, formatted correctly.

## 2. Fixes from the Owner test board (root causes found)

**Root cause shared by O4, O5, O6, O9, O12.** Every drawer is a modal `<dialog>`, which the browser draws in its top
layer. The toast tray used `z-50`, so every error toast was drawn *behind* the open drawer. Nothing was wrong with the
rules; the tester simply never saw the message. React 19 also wiped the form after a failed save, so the person had to
retype everything.

| ID | What the tester saw | Cause | Fix |
| --- | --- | --- | --- |
| O1 | Sign out: "this site cannot be reached" | Redirect used the address the server listens on (`localhost` / `0.0.0.0`), not the address the visitor typed (`192.168.18.13:3200`) | `lib/http/origin.ts` builds redirects from the Host / forwarded headers; used by sign-out, email-link confirm and the signed-out redirect in `proxy.ts` |
| O2 | Could not test | Needs a real authenticator | Not a code bug. Existing TOTP tests cover refusal. Manual steps stay on the board. |
| O4 | New person: email sent, not in list | A failed save was invisible (toast behind the drawer); a clash was only found *after* the invite email was sent | Toasts moved into the top layer (popover); inline red message inside every Users and Teams drawer; email and phone clashes are checked **before** the invite is sent |
| O5 | Team not created | Same invisible error; also a team needs a free Team Lead | Same fixes; clearer text for a one-letter name |
| O6 | Duplicate staff phone: no message | Same invisible error | Field error under the Phone box, nothing is created |
| O9 | Disabling or demoting a lead: no message | Same invisible error | Message shown inside the confirm drawer |
| O12 | Could not test the reset email | A failure (if any) was invisible | Visible errors; e2e test proves the reset email reaches the inbox |
| O22 | Landlines refused | Validator wanted 10 digits after the 0 | Section 1 |

Also found: the People list asked the API for all rows at once, and the API caps a request at 1,000 rows, so on a big
database people silently dropped off the list. The list now reads in pages.

## 3. Fixes from the Admin test board

| ID | What the tester saw | Cause | Fix |
| --- | --- | --- | --- |
| A8 | "Could not understand the test case" | The card did not say where to click | Card rewritten step by step (All leads, tick a lead, Bulk actions, Reason, Move to team) |
| A15 | No alert for a referral with no session date | The alert logic is correct (new DB test proves it) but only ran from a 15-minute database timer, and only while the database was running | Timer now every 5 minutes, and the sweep also runs when anyone opens a page (at most once a minute). Each referral is stamped once alerted, so there are never two alerts. |

## 4. Test board updates

- New cards: O22b (foreign number on Add leads), O22c (foreign number in an import), O6b (foreign staff number),
  and a search-by-foreign-number step.
- Reword O22, O23, A8. Reset the marks for every card whose code changed.

## 5. Order of work and checks

1. Phone library + unit tests.
2. Migration + pgTAP.
3. Validators, UI copy, import, search, template.
4. O4 / O5 / O6 / O9 (users and teams), with tests.
5. O1 sign-out redirect.
6. A15 alert, A8 wording.
7. Test board + `docs/PROGRESS.md`.
8. Full check: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:db && pnpm test:e2e`.

**Blocker to watch:** Docker Desktop is not running on this machine, so `pnpm test:db` and `pnpm test:e2e` (which need
the local Supabase) cannot run until it is started. Lint, typecheck and unit tests do not need it.

## 6. Out of scope (ask first)

- Country-aware validation (real mobile ranges per country) would need libphonenumber. Not added without your OK.
- Real email delivery (SMTP provider) is a paid service decision.
