# Trading Labs CRM: design

This file tells you how the app looks, moves and talks. `BUILD.md` tells you what to build. When you build any screen, use only the tokens and components defined here.

## 1. The vibe

**A clean, professional sales workspace in white and purple, with a scoreboard at its heart.**

The people using this are sales agents, Team Leads and managers in Islamabad, working on laptops between calls. The CRM should feel like a serious financial tool they trust with client money and documents, and still make the competition on verified deposits easy to see.

Three ideas carry the whole design:

1. **White and purple.** A light page, white cards, and a deep purple sidebar where the white TL logo lives. One confident purple for actions.
2. **The slant.** The TL logo is cut at a 30 degree lean. That cut is the app's signature shape, used only on the things that are about winning.
3. **Money you can watch move.** Verified deposits are the only thing that is green, counts up, or celebrates.

Everything else stays quiet and orderly so those three land.

## 2. Logo

- File: `public/brand/tl-logo.png`. It is a white "TL" monogram on a transparent background.
- Because it is white, it only ever sits on `--tl-brand` purple: the sidebar, the menu drawer, the login panel, app icons and the Arena. Never on the white page, never on a photo, never recoloured, never with a shadow or outline.
- Keep clear space around it equal to a quarter of its width.
- Sizes: 28 px in the sidebar next to the "Trading Labs" wordmark, 48 px on the login screen, 72 px on the Arena in TV mode.
- App icon and favicon: the logo centred on a `--tl-brand` square with 20 percent padding.
- Alt text is always "Trading Labs".

## 3. Colour

The page is light, surfaces are white, and purple carries the brand. If a screen reads as grey or as a dark theme, it is wrong. The Arena is the one dark purple page.

### Base

| Token | Hex | Use |
| --- | --- | --- |
| `--tl-bg` | `#F7F5FC` | Page background on every app route |
| `--tl-surface` | `#FFFFFF` | Cards, drawers, tables, top bar, inputs |
| `--tl-raised` | `#F1EDFA` | Hover, selected rows, disabled inputs |
| `--tl-line` | `#E4DEF2` | Borders and dividers, 1 px |
| `--tl-line-strong` | `#CFC6E6` | Input and secondary button borders |
| `--tl-text` | `#1B1030` | Headings, amounts, main text |
| `--tl-text-2` | `#3D3452` | Body text |
| `--tl-muted` | `#6B6385` | Labels, timestamps, helper text |

### Brand

| Token | Hex | Use |
| --- | --- | --- |
| `--tl-brand` | `#220B47` | Sidebar, menu drawer, logo tiles |
| `--tl-brand-raised` | `#3B1D78` | Hover inside the sidebar |
| `--tl-brand-text` | `#FFFFFF` | Text and logo on brand purple |
| `--tl-brand-muted` | `#C9BDF0` | Inactive menu items and group labels |
| `--tl-primary` | `#5B2EC9` | Primary button fill, links, active states |
| `--tl-primary-hover` | `#4A22A8` | Primary button hover |
| `--tl-primary-soft` | `#EFE9FC` | Avatar initials, soft highlights |
| `--tl-focus` | `#7C4DFF` | Focus ring |

### Meaning

These three colours carry meaning and are never used as decoration.

| Token | Hex | Means |
| --- | --- | --- |
| `--tl-win` | `#0D7050` | Verified money, and only verified money. A green candle. |
| `--tl-danger` | `#C8254A` | Overdue, rejected, errors. A red candle. |
| `--tl-wait` | `#A35A00` | Waiting on someone: pending, due soon. |

### Stages

A stage chip uses its colour as text, the same colour mixed at 10 percent with white as fill, and at 28 percent as border.

| Stages | Token | Hex |
| --- | --- | --- |
| New, Assigned | `--tl-stage-idle` | `#6B6385` |
| No answer, Follow-up | `--tl-stage-call` | `#A35A00` |
| Interested, Post-session follow-up | `--tl-stage-hot` | `#1D64C8` |
| With Technical Analysis | `--tl-stage-analyst` | `#7A3FD1` |
| Documents pending | `--tl-stage-docs` | `#0A6A62` |
| Deposit recorded | `--tl-stage-recorded` | `#266A41` |
| Deposit verified | `--tl-stage-verified` | `#0D7050` |
| Not interested, Invalid | `--tl-stage-closed` | `#635B7C` |

### Teams

Each team picks one colour. It appears on that team's Arena lane, progress bars, avatar ring and chart series, and nowhere else. Team colours are fills, never text.

| Name | Hex |
| --- | --- |
| Cyan | `#0EA5C6` |
| Coral | `#F06A45` |
| Pink | `#E0478F` |
| Lemon | `#D4B400` |
| Sky | `#3B7DDD` |
| Lilac | `#9B6BEB` |

### Arena background

The Arena uses a vertical gradient from `#2C0F5C` at the top to `#1C083B` at the bottom, with one soft radial glow of `#7C4DFF` at 18 percent opacity behind the team race. Both ends of the gradient are purple. Do not let it fade to black. On the Arena, text uses white and `#D6CCF2`.

Every text colour above is checked at 4.5 to 1 or better against `--tl-bg`, `--tl-surface` and `--tl-raised`, and the brand text colours against `--tl-brand` and `--tl-brand-raised`. White on `--tl-primary` is 7.8 to 1. The styleguide test enforces this.

## 4. Type

Two families, with clearly different jobs.

| Role | Family | Settings |
| --- | --- | --- |
| Display: amounts, ranks, screen titles, the Arena | **Archivo** | Weight 700, upright, tight tracking (-0.02em) |
| Everything else | **Figtree** | Weight 400 for text, 500 for labels, 600 for buttons and titles |

| Token | Size / line height | Family | Use |
| --- | --- | --- | --- |
| `display-xl` | 64 / 68 | Archivo | Arena totals in TV mode |
| `display-l` | 36 / 40 | Archivo | Arena totals, tile numbers |
| `display-m` | 24 / 30 | Archivo | Screen titles |
| `title` | 16 / 24 | Figtree 600 | Card, drawer and section titles |
| `body` | 14 / 20 | Figtree 400 | Text, inputs, table cells |
| `label` | 13 / 18 | Figtree 500 | Field labels, table headers |
| `small` | 12 / 16 | Figtree 500 | Timestamps, helper text, chips |

- Amounts always use tabular figures (`font-variant-numeric: tabular-nums`) so they do not jump as they count.
- Sentence case everywhere. No all-caps labels.
- Line length for text stays under 70 characters.
- Load both families with `next/font` and no layout shift.

## 5. The slant

The logo's strokes lean 30 degrees from vertical. That angle is `--tl-slant: 30deg`. A shape "has the slant" when its left and right edges are cut at that angle with `clip-path`, so a 40 px tall bar is cut 23 px at each end.

**Use the slant on:**

- Arena team lanes and their fill.
- Rank badges.
- Progress-to-target bars.
- The celebration shards.
- The active marker in the stage tracker.

**Never use the slant on:** cards, buttons, inputs, tables, chips, avatars, or body text. If everything leans, nothing does.

## 6. Layout and spacing

- It is a web app for laptop screens. Design at 1366 to 1440 px. Every screen also works at 1024 px with no horizontal scroll, and at 1920 px for the Arena on TV.
- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64.
- Radius: chips fully round, buttons and inputs 8 px, cards 12 px, drawers 16 px where they show a corner.
- Depth comes from white on the light page, a 1 px `--tl-line` border and a soft shadow (`--tl-shadow-card`). Drawers and toasts use `--tl-shadow-pop`. Glow is reserved for celebrations.
- Breakpoints: below 1024 px is a narrow window, 1024 px and up is a laptop, 1280 px is a large laptop, 1920 px is TV.
- Shell: a 248 px purple sidebar with the logo and the grouped menu, always visible from 1024 px. A 64 px white top bar with search, bell and the signed-in user. Below 1024 px the sidebar hides and a menu button opens it as a drawer.
- Content is up to 1280 px wide with 32 px side padding. Queues are list and detail side by side.
- Click targets are at least 32 by 32 px; buttons are 40 px tall.

## 7. Components

Build these once in `components/ui` and reuse them. Show all of them on `/styleguide`. The shell adds a PageHeader (screen title, description, actions) at the top of every screen.

| Component | Looks like | Rules |
| --- | --- | --- |
| **Button** | Primary: `--tl-primary` fill, white label, 40 px tall. Secondary: white with a `--tl-line-strong` border and `--tl-text` label. Danger: `--tl-danger` border and label. Ghost for icon buttons. | One primary button per screen. The label says what happens: "Save call", "Verify deposit". |
| **Card** | `--tl-surface`, 12 px radius, 1 px line, soft card shadow, 24 px padding. Header with title, optional description and actions. | No card inside a card. |
| **Sheet** (drawer) | Slides in from the right, 480 px wide, full height. Title and close button at the top, actions pinned at the bottom with the primary action last. | Closing with unsaved input asks first. |
| **Input, Select** | White fill, `--tl-line-strong` border, 8 px radius, 40 px tall, label above in `label` style, `--tl-primary` border and soft ring on focus. | Errors appear under the field in `--tl-danger`, in a full sentence. |
| **StageChip** | Fully round, colours from section 3, stage name in `label` style. | Always shows the name. Colour is never the only signal. |
| **Avatar** | Round photo, or initials in `--tl-primary` on `--tl-primary-soft`. A white gap then a 2 px ring in the team colour. | Sizes 28, 40, 64, 96. |
| **MoneyText** | `Rs 250,000` in Archivo with tabular figures. `--tl-win` when verified, `--tl-text` otherwise. | Can count up from the old value over 600 ms. |
| **SlantBar** | A track in `--tl-raised` and a fill in the team colour, both cut with the slant. Optional target tick. | Fill width is the share of target, capped at 100 percent with a "+" marker beyond it. |
| **RankBadge** | Slanted block with the rank number in Archivo. Rank 1 is white on `--tl-primary` with a crown glyph. | Shows a small up or down arrow and the number of places moved since yesterday. |
| **Toast** | Top right, white with a pop shadow and a coloured left edge. 4 seconds. | Success uses `--tl-win` on the left edge. Never stacks more than two. |
| **DataTable** | White table with a light header row, 1 px row dividers and a hover tint. On narrow windows each row becomes a card. | Sticky header, sortable columns, row count above. Numbers right-aligned in tabular figures. |
| **EmptyState** | One line saying what belongs here, one line saying what to do, one button. | No illustrations of sad faces. |
| **CountTile** | White tile with a 4 px left edge in purple, or in the wait or danger colour. Big Archivo number over a `label`. | Whole tile is clickable and opens the list behind the number. |

## 8. The Arena

The Arena is the shared page at `/arena`. Everyone in the company can open it, and it runs on the office TV. It answers one question at a glance: **which team is winning right now?**

The team race is the one loud element. Everything under it is calm.

### Desktop and TV

```
+--------------------------------------------------------------------------------+
| [TL]  The Arena           Today  This week [This month] All time  19 days left |
+--------------------------------------------------------------------------------+
|                                                                                |
|  1  (o) Falcons     /===========================================/ Rs 4,250,000 |
|         Ayesha K.   /-------------------------------------------|--/  85%      |
|                                                                                |
|  2  (o) Markhors    /================================/            Rs 3,100,000 |
|         Hamza S.    /-------------------------------------------|--/  62%      |
|                                                                                |
|  3  (o) Shaheens    /========================/                    Rs 2,400,000 |
|  4  (o) Leopards    /================/                            Rs 1,650,000 |
|                                                                                |
+----------------------------------------+---------------------------------------+
| Top agents                             | Live                                  |
|  1  ^2  (o) Bilal R.   Rs 1,200,000  6 | Falcons  + Rs 250,000  Bilal   2 min  |
|  2  v1  (o) Sana T.    Rs 1,100,000    | Shaheens + Rs 80,000   Hira   14 min  |
|  3      (o) Hira M.    Rs   940,000  3 | Markhors + Rs 400,000  Sana    1 h    |
|  4  ^1  (o) Usman A.   Rs   700,000    +---------------------------------------+
|  5      (o) Zara N.    Rs   560,000  2 | Top analysts                          |
|                                        |  1  (o) Omar F.  Rs 2,000,000  9 sess |
+----------------------------------------+---------------------------------------+
| Rs 11,400,000 verified this month    38 new funded clients    Biggest Rs 600k  |
+--------------------------------------------------------------------------------+
```

- **Header:** logo, the name "The Arena", the period switch, and days left in the month. In TV mode the switch is hidden and a clock replaces it.
- **Team race:** one lane per team, sorted by total. Each lane has a RankBadge, the Team Lead's Avatar with the team ring, the team name in Archivo, the Team Lead's name in `label`, a SlantBar toward target with a tick at 100 percent, the total as MoneyText in `display-l`, and the percentage of target. Lane height is 72 px on desktop and 96 px on TV.
- **Top agents:** the top 10, with RankBadge, movement arrow, Avatar, first name and initial, total, and the streak count beside a flame when it is 3 days or more.
- **Live:** the newest verified deposits, newest on top: team name in the team colour, amount in `--tl-win`, the agent's first name, and time ago. It shows no client detail of any kind.
- **Top analysts:** the top 3, with total and sessions held.
- **Month strip:** three facts in Archivo, each with a `label` under it.

### Narrow windows

- Below 1024 px the team race stacks: name and total on one line, the SlantBar beneath.
- Agents, Live and Analysts become three tabs.
- A sticky "You" bar sits at the bottom with the viewer's rank, total and streak. Clicking it scrolls to their row. Analysts see their analyst rank. Admins do not get this bar.
- In narrow lists, amounts above Rs 999,999 shorten to one decimal with M, for example `Rs 1.2M`. The team totals stay in full.

### TV mode

`/arena?tv=1` is full screen with no menu and no "You" bar. It rotates Team race with Top agents, then Team race with Top analysts, every 20 seconds. Type steps up one size. The live feed stays on screen in both views.

### States

- **Start of month, no deposits yet:** lanes are empty tracks, sorted by team name. The feed reads "New month, clean board. The first verified deposit takes the lead."
- **A team passes its target:** the fill reaches the tick, a "+" marker appears, and the percentage keeps counting past 100.
- **Loading:** lane tracks and list rows appear as `--tl-raised` blocks in their final sizes. No spinner.
- **Realtime disconnected:** a small `--tl-wait` dot and "Reconnecting" appear in the header. Numbers stay as they were.

## 9. Motion

Motion is spent in three places. Everywhere else, things simply appear.

| Moment | What moves | Timing |
| --- | --- | --- |
| **Arena opens** | Lanes fill from zero to their value, top team first | 900 ms each, 80 ms apart, ease-out |
| **Deposit verified** | That team's lane surges to its new value, the total counts up, 12 slanted shards in the team colour and white burst from the end of the bar, and the feed row slides in | 1.2 s in total, once |
| **Rank change** | The two rows swap places | 400 ms, ease-in-out |

Small responses to a click are fine: hover tints, a drawer slides in over 200 ms, a toast slides in. Do not add entrance animations to cards, sections or list rows.

With `prefers-reduced-motion: reduce`, lanes and totals jump to their values, the shards do not render, and rows swap without animation.

Sound is off by default. TV mode has a toggle for one short chime on a verified deposit.

## 10. The team layer

These are the things that make the app feel made for this sales floor. Build the first five in version 1.

1. **Fast to work.** The next action is always one click away. Logging a No answer takes three clicks.
2. **Always know where you stand.** Agents see their rank and total on Today's calls and in the Arena's "You" bar. Rank arrows show movement since yesterday.
3. **Streaks.** A flame and a day count for consecutive working days with every follow-up done on time. It rewards discipline, not only big deposits. It shows from day 3.
4. **Wins are an event.** A verified deposit plays the celebration on the Arena and sends the agent a toast with the amount in `--tl-win`. Nothing else in the app celebrates.
5. **Instant feedback.** Every save answers within 200 ms with a toast that says what happened and what is next.
6. **Later, not now:** badges, a monthly recap card an agent can share to their WhatsApp status, team colour themes on the agent's own screens. Do not build these in version 1.

Two glyphs are allowed in the interface: a flame for streaks and a crown for rank 1. Draw them as icons in the icon set, not as emoji characters. Use no other emoji in the product.

Keep it fair: the flame rewards on-time follow-ups, not deposit size, so newer agents have something to win too.

## 11. Voice and microcopy

The app talks like a sharp teammate: short, direct, a little energy on wins, calm on problems. It never talks like a bank form and never tries to sound like a meme.

- Sentence case. Short sentences. Numbers written as numbers.
- Say what happened, then what is next.
- Errors say what is wrong and how to fix it. They do not apologise and they do not joke.
- A button keeps the same verb all the way through: "Verify deposit" produces "Deposit verified".
- Hype is for staff and for verified deposits only. Nothing a client could see, and no text anywhere, promises profit or returns.

| Where | Copy |
| --- | --- |
| Today's calls, nothing left | "All clear. No calls left today." |
| Today's calls, overdue heading | "3 overdue. Start here." |
| New lead notification | "New lead: Ahmed, from Instagram. First call due in 24 hours." |
| Call saved | "Call saved. Next follow-up tomorrow at 3:00 pm." |
| Lead returned after max tries | "No answer 5 times. Sent back to your Team Lead." |
| Deposit recorded | "Deposit sent to Admin. It scores once it is verified." |
| Deposit verified, to the agent | "Verified. Rs 250,000 is on the board." |
| Rank up | "You moved up to number 3." |
| Streak | "6-day streak. Every follow-up on time." |
| Document rejected | "CNIC front rejected: blurry. Retake it and upload again." |
| Duplicate phone | "That number is already in the system." |
| No access | "This lead belongs to another team." |
| Arena, start of month | "New month, clean board. The first verified deposit takes the lead." |
| Reconnecting | "Reconnecting. Your numbers are safe." |

## 12. Accessibility and quality floor

- Text contrast of 4.5 to 1 or better, using the token pairs in section 3.
- A visible 2 px `--tl-focus` ring on every interactive element. Full keyboard use on every screen.
- Colour is never the only signal: chips carry names, rank changes carry arrows, overdue items carry the word "Overdue".
- Every icon-only button has an accessible name.
- Reduced motion is respected everywhere.
- No horizontal scroll at 1024 px. Wide tables become cards on narrow windows.
- The theme colour meta tag and the manifest theme are `#220B47`.

## 13. Do not

- Do not use a dark page background outside the Arena, or a grey page.
- Do not put the white logo on anything but `--tl-brand` purple.
- Do not use `--tl-win` for anything except verified money.
- Do not use team colours as text.
- Do not put the slant on cards, buttons or inputs.
- Do not use gradients as decoration. The only gradient is the Arena background.
- Do not write labels in all caps, or add small labels above every heading.
- Do not join facts with dots or dashes in one string. Lay them out as separate elements.
- Do not add an arrow to button or link text.
- Do not use a monospace font for numbers. Archivo with tabular figures does that job.
- Do not animate things that the user did not cause, apart from the three moments in section 9.
- Do not use emoji characters, stock illustrations or mascots.

## 14. Setup

The tokens live in `app/globals.css` as CSS variables on `:root` and are mapped into the Tailwind theme with `@theme inline` (classes such as `bg-tl-surface`, `text-tl-muted`, `border-tl-line`, `text-display-m`, `shadow-card`). Components reference the tokens, never raw hex values. `app/globals.css` is the source of truth for exact values; section 3 lists them.

Utilities defined there:

- `tl-display`: Archivo 700, upright, tracking -0.02em.
- `tl-amount`: tabular figures.
- `tl-slant`: cuts a bar with the logo's lean, using `--bar-h` for the cut.
- `tl-arena`: the Arena's dark purple gradient and glow.

