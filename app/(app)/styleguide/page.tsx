import { Flame } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { NoAccess } from "@/components/features/shell/no-access";
import { PageHeader } from "@/components/features/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { CountTile } from "@/components/ui/count-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { MoneyText } from "@/components/ui/money-text";
import { RankBadge } from "@/components/ui/rank-badge";
import { SlantBar } from "@/components/ui/slant-bar";
import { StageChip } from "@/components/ui/stage-chip";
import { requireAccess } from "@/lib/auth/session";
import { STAGES } from "@/lib/leads/stages";
import { TEAM_COLORS, teamColorVar } from "@/lib/teams";
import { CountUpDemo, FormDemo, SheetDemo, TableDemo, ToastDemo } from "./demos";

export const metadata: Metadata = { title: "Styleguide" };

const BASE = ["bg", "surface", "raised", "line", "line-strong", "text", "text-2", "muted"];
const BRAND = ["brand", "brand-raised", "primary", "primary-hover", "primary-soft", "focus"];
const MEANING = ["win", "danger", "wait"];

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      {children}
    </Card>
  );
}

function Swatch({ token }: { token: string }) {
  return (
    <li className="flex items-center gap-3">
      <span
        aria-hidden
        className="size-9 shrink-0 rounded-control border border-tl-line"
        style={{ backgroundColor: `var(--tl-${token})` }}
      />
      <code className="text-label text-tl-text-2">--tl-{token}</code>
    </li>
  );
}

export default async function StyleguidePage() {
  if (!(await requireAccess("/styleguide"))) return <NoAccess />;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Styleguide"
        description="Every token and base component in one place. If it is not here, it is not in the app."
      />

      <Section title="Colour">
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          <ul className="flex flex-col gap-2" aria-label="Base colours">
            {BASE.map((t) => (
              <Swatch key={t} token={t} />
            ))}
          </ul>
          <ul className="flex flex-col gap-2" aria-label="Brand colours">
            {BRAND.map((t) => (
              <Swatch key={t} token={t} />
            ))}
          </ul>
          <ul className="flex flex-col gap-2" aria-label="Meaning colours">
            {MEANING.map((t) => (
              <Swatch key={t} token={t} />
            ))}
          </ul>
          <ul className="flex flex-col gap-2" aria-label="Team colours">
            {TEAM_COLORS.map((t) => (
              <Swatch key={t} token={`team-${t}`} />
            ))}
          </ul>
        </div>
      </Section>

      <Section title="Type">
        <div className="flex flex-col gap-3 overflow-hidden">
          <p className="tl-display tl-amount text-display-xl text-tl-text">Rs 4,250,000</p>
          <p className="tl-display tl-amount text-display-l text-tl-text">Rs 1,200,000</p>
          <p className="tl-display text-display-m text-tl-text">Screen title</p>
          <p className="text-title font-semibold text-tl-text">Card and section title</p>
          <p className="text-body text-tl-text-2">Body text for things people read. Short sentences, sentence case.</p>
          <p className="text-label font-medium text-tl-text">Field label and table header</p>
          <p className="text-small font-medium text-tl-muted">Timestamp and helper text</p>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap gap-3">
          <Button>Save call</Button>
          <Button variant="secondary">Cancel</Button>
          <Button variant="danger">Reject deposit</Button>
          <Button disabled>Add deposit</Button>
        </div>
      </Section>

      <Section title="Inputs and selects">
        <FormDemo />
      </Section>

      <Section title="Stage chips">
        <ul className="flex flex-wrap gap-2" aria-label="All lead stages">
          {STAGES.map((s) => (
            <li key={s}>
              <StageChip stage={s} />
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Avatars">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name="Ayesha Khan" size={28} team="cyan" />
          <Avatar name="Hamza Shah" size={40} team="coral" />
          <Avatar name="Sana Tariq" size={64} team="pink" />
          <Avatar name="Omar Farooq" size={96} team="lemon" />
          <Avatar name="Zara Noor" size={40} />
        </div>
      </Section>

      <Section title="Money" description="Green means verified. Nothing else is green.">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline gap-6">
            <MoneyText amount={250_000} verified className="text-display-m" />
            <MoneyText amount={250_000} className="text-display-m" />
            <MoneyText amount={1_200_000} compact verified className="text-title" />
          </div>
          <CountUpDemo />
        </div>
      </Section>

      <Section title="Slant bars and rank badges">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-3">
                <RankBadge rank={1} moved={2} size={32} />
                <span className="tl-display text-title text-tl-text">Falcons</span>
              </span>
              <span className="tl-amount text-label font-semibold text-tl-text">112%</span>
            </div>
            <SlantBar value={4_760_000} target={4_250_000} color={teamColorVar("cyan")} label="Falcons, share of target" height={16} />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-3">
                <RankBadge rank={2} moved={-1} size={32} />
                <span className="tl-display text-title text-tl-text">Markhors</span>
              </span>
              <span className="tl-amount text-label font-semibold text-tl-text">62%</span>
            </div>
            <SlantBar value={3_100_000} target={5_000_000} color={teamColorVar("coral")} label="Markhors, share of target" height={16} />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-3">
                <RankBadge rank={3} size={32} />
                <span className="tl-display text-title text-tl-text">Shaheens</span>
              </span>
              <span className="tl-amount text-label font-semibold text-tl-text">0%</span>
            </div>
            <SlantBar value={0} target={4_000_000} color={teamColorVar("pink")} label="Shaheens, share of target" height={16} />
          </div>
          <p className="flex items-center gap-2 text-label font-medium text-tl-text-2">
            <Flame aria-hidden className="size-4 text-tl-primary" />
            6-day streak. Every follow-up on time.
          </p>
        </div>
      </Section>

      <Section title="Count tiles">
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <CountTile count={7} label="Due today" href="/today" />
          <CountTile count={3} label="Overdue" href="/today" tone="danger" note="Start here" />
          <CountTile count={4} label="Deposits to verify" href="/deposits" tone="wait" note="13 h" />
          <CountTile count={12} label="New leads" href="/today" />
        </div>
      </Section>

      <Section title="Table">
        <TableDemo />
      </Section>

      <Section title="Drawer and toast" description="Drawers slide in from the right. Toasts appear top right, never more than two.">
        <div className="flex flex-wrap gap-3">
          <SheetDemo />
          <ToastDemo />
        </div>
      </Section>

      <Section title="Empty state">
        <EmptyState
          title="All clear. No calls left today."
          body="New leads land here as soon as your Team Lead assigns them."
          action={<Button>Open pipeline</Button>}
        />
      </Section>
    </div>
  );
}
