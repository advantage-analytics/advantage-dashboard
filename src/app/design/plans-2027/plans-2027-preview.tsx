"use client";

import Link from "next/link";
import { useState } from "react";
import { PlanCheckoutDialog } from "@/components/dashboard/billing/plan-checkout-dialog";
import { FileStepContent } from "@/components/dashboard/matches/new-match-wizard/FileStepContent";
import {
  FooterMeter,
  PlainReadout,
} from "@/components/dashboard/matches/new-match-wizard/FooterMeter";
import { FileHoursNote } from "@/components/dashboard/matches/new-match-wizard/UploadWizardSteps";
import { WizardShell } from "@/components/dashboard/matches/new-match-wizard/WizardShell";
import {
  CONTINUE_LABEL,
  STEP_CONFIG_PROCESSING,
  type FormData,
  type VideoProbeSummary,
} from "@/components/dashboard/matches/new-match-wizard/types";
import { PlanSettings } from "@/components/dashboard/settings/plan-settings";
import { PlanMeterPill } from "@/components/dashboard/beta-header-meter";
import { PlanHomeCard } from "@/components/dashboard/home-feed/pilot-card";
import { PersonalUsageCard } from "@/components/dashboard/settings/personal-usage-card";
import { PlanHoursCard } from "@/components/dashboard/settings/teams/plan-hours-card";
import {
  homeCardView,
  planHoursView,
  planStandingFor,
  teamMeterSuffix,
  usageCardView,
  type PlanStanding,
} from "@/lib/billing/plan-copy";
import type { ProgramUsage } from "@/lib/data/usage-server";
import type { AllowanceWorkspace } from "@/lib/services/splitstep/allowance";
import {
  fileStepHoursNote,
  meterSuffix,
  type CheckoutAccount,
  type CheckoutMode,
  type PreviewState,
  type ScheduledChange,
} from "@/lib/billing/checkout-view";
import type { PlanBilling } from "@/lib/billing/plan-fields";
import type { PlanPageInput } from "@/lib/billing/plan-page-view";
import { planHoursSeconds, seasonAllowance } from "@/lib/billing/plans";
import { quoteUpgrade } from "@/lib/billing/upgrade";

const noop = () => {};
const H = 3600;
const M = 60;
/** The season pools the team fixtures draw from, as the plan module holds them. */
const PROGRAM_SPRING_H = seasonAllowance("program", "spring").hours;
const ELITE_YEAR_H = seasonAllowance("elite", "full_year").hours;

/* ---------- Fixtures: a Player month from Apr 14 to May 14, 2027 ---------- */

const PERIOD_START = new Date("2027-04-14T00:00:00Z");
const PERIOD_END = new Date("2027-05-14T00:00:00Z");
const RESETS_ON = "May 14";

const NEVER: PlanBilling = {
  plan: "free",
  periodStart: null,
  period: null,
  status: null,
  periodEnd: null,
  everSubscribed: false,
};

function subscribed(plan: "player" | "player-pro"): PlanBilling {
  return {
    plan,
    periodStart: PERIOD_START.toISOString(),
    period: "monthly",
    status: "active",
    periodEnd: PERIOD_END.toISOString(),
    everSubscribed: true,
  };
}

const PAGE_FREE: PlanPageInput = {
  plan: "free",
  billing: NEVER,
  allowanceKind: "none",
  capSeconds: 0,
  planLeftSeconds: 0,
  extraSeconds: 0,
  nextExtraExpiresAt: null,
  resetsOn: null,
  freeEnds: "Dec 31, 2026",
};

const PAGE_PLAYER: PlanPageInput = {
  plan: "player",
  billing: subscribed("player"),
  allowanceKind: "plan",
  capSeconds: planHoursSeconds("player"),
  planLeftSeconds: 3 * H + 12 * M,
  extraSeconds: 1 * H,
  nextExtraExpiresAt: "2028-02-02T00:00:00Z",
  resetsOn: RESETS_ON,
  freeEnds: "Dec 31, 2026",
};

const PAGE_PLAYER_PRO: PlanPageInput = {
  ...PAGE_PLAYER,
  plan: "player-pro",
  billing: subscribed("player-pro"),
  capSeconds: planHoursSeconds("player-pro"),
  planLeftSeconds: 7 * H + 40 * M,
  extraSeconds: 0,
  nextExtraExpiresAt: null,
};

const ACCOUNT_FREE: CheckoutAccount = {
  plan: "free",
  period: null,
  planLeftSeconds: 0,
  extraSeconds: 0,
  resetsOn: null,
  firstMonthEligible: true,
};

const ACCOUNT_PLAYER: CheckoutAccount = {
  plan: "player",
  period: "monthly",
  planLeftSeconds: 3 * H + 12 * M,
  extraSeconds: 1 * H,
  resetsOn: RESETS_ON,
  firstMonthEligible: false,
};

/** Out of hours mid-month: 23 minutes of Player left, no extra hours. */
const ACCOUNT_PLAYER_SPENT: CheckoutAccount = {
  ...ACCOUNT_PLAYER,
  planLeftSeconds: 23 * M,
  extraSeconds: 0,
};

const ACCOUNT_PLAYER_PRO_SPENT: CheckoutAccount = {
  ...ACCOUNT_PLAYER_SPENT,
  plan: "player-pro",
};

/** The page behind a spent account's dialog: the same 23 minutes, no extra. */
const PAGE_PLAYER_SPENT: PlanPageInput = {
  ...PAGE_PLAYER,
  planLeftSeconds: ACCOUNT_PLAYER_SPENT.planLeftSeconds,
  extraSeconds: ACCOUNT_PLAYER_SPENT.extraSeconds,
  nextExtraExpiresAt: null,
};

const PAGE_PLAYER_PRO_SPENT: PlanPageInput = {
  ...PAGE_PLAYER_PRO,
  planLeftSeconds: ACCOUNT_PLAYER_PRO_SPENT.planLeftSeconds,
  extraSeconds: ACCOUNT_PLAYER_PRO_SPENT.extraSeconds,
};

/** The real quote, on fixed dates: 15 days left, so the credit is by days. */
const PREVIEW_DAYS: PreviewState = {
  status: "ready",
  preview: {
    ...quoteUpgrade({
      from: "player",
      to: "player-pro",
      period: "monthly",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      now: new Date("2027-04-29T00:00:00Z"),
      usedSeconds: planHoursSeconds("player") - (3 * H + 12 * M),
    }),
    period: "monthly",
  },
};

/** Same day, 23 minutes of hours left: the smaller share is the hours. */
const PREVIEW_HOURS: PreviewState = {
  status: "ready",
  preview: {
    ...quoteUpgrade({
      from: "player",
      to: "player-pro",
      period: "monthly",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      now: new Date("2027-04-29T00:00:00Z"),
      usedSeconds: planHoursSeconds("player") - 23 * M,
    }),
    period: "monthly",
  },
};

/** Player, monthly → yearly on the same day: the same $75 credit for 15 days. */
const PREVIEW_YEARLY: PreviewState = {
  status: "ready",
  preview: {
    ...quoteUpgrade({
      from: "player",
      to: "player",
      period: "monthly",
      toPeriod: "yearly",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      now: new Date("2027-04-29T00:00:00Z"),
      usedSeconds: planHoursSeconds("player") - (3 * H + 12 * M),
    }),
    period: "yearly",
    fromPeriod: "monthly",
  },
};

const NEEDED = 1 * H + 52 * M;

/* ---------- A failed renewal: the plan stays, the hours wait ---------- */

const PAGE_PAST_DUE: PlanPageInput = {
  ...PAGE_PLAYER,
  billing: { ...subscribed("player"), status: "past_due" },
  // What `allowanceFor()` answers for a past-due plan: its own kind, no hours.
  capSeconds: 0,
  planLeftSeconds: 0,
  extraSeconds: 0,
  nextExtraExpiresAt: null,
  resetsOn: null,
};

const ACCOUNT_PAST_DUE: CheckoutAccount = {
  ...ACCOUNT_PLAYER,
  planLeftSeconds: 0,
  extraSeconds: 0,
  resetsOn: null,
  pastDue: true,
};

/* ---------- MOCK ONLY: a change at renewal (nothing is wired) ---------- */

/** Player Pro, monthly, Jan 14 to Feb 14, 2027. */
const PAGE_PRO_FEB: PlanPageInput = {
  ...PAGE_PLAYER_PRO,
  billing: {
    ...subscribed("player-pro"),
    periodStart: "2027-01-14T00:00:00Z",
    periodEnd: "2027-02-14T00:00:00Z",
  },
  resetsOn: "Feb 14",
};
const ACCOUNT_PRO_FEB: CheckoutAccount = {
  plan: "player-pro",
  period: "monthly",
  planLeftSeconds: 7 * H + 40 * M,
  extraSeconds: 0,
  resetsOn: "Feb 14",
  firstMonthEligible: false,
};
/** Player Pro → Player, at the month's renewal. */
const MOVE_DOWN: ScheduledChange = {
  to: { plan: "player", period: "monthly" },
  effectiveOn: "2027-02-14",
};

/** Player, yearly, Jan 14, 2027 to Jan 14, 2028. */
const PAGE_PLAYER_YEAR: PlanPageInput = {
  ...PAGE_PLAYER,
  billing: {
    ...subscribed("player"),
    period: "yearly",
    periodStart: "2027-01-14T00:00:00Z",
    periodEnd: "2028-01-14T00:00:00Z",
  },
  resetsOn: "Feb 14",
};
const ACCOUNT_PLAYER_YEAR: CheckoutAccount = {
  ...ACCOUNT_PLAYER,
  period: "yearly",
  resetsOn: "Feb 14",
};
/** Player yearly → Player monthly, at the year's renewal. */
const PAY_MONTHLY: ScheduledChange = {
  to: { plan: "player", period: "monthly" },
  effectiveOn: "2028-01-14",
};

type DialogState = {
  kind: "dialog";
  label: string;
  page: PlanPageInput;
  mode: CheckoutMode;
  account: CheckoutAccount;
  preview?: PreviewState;
  refusal?: string;
  wizard?: boolean;
  pending?: boolean;
};
type State =
  | { kind: "page"; label: string; page: PlanPageInput }
  | DialogState
  | { kind: "file"; label: string; plan: "free" | "player"; pastDue?: boolean }
  | { kind: "pill"; label: string }
  | { kind: "home"; label: string }
  | { kind: "usage"; label: string }
  | { kind: "team-hours"; label: string }
  | { kind: "team-meter"; label: string }
  | { kind: "email"; label: string; email: string };

/* ---------- Stage F fixtures: January 30, 2027 ---------- */

const TODAY = "2027-01-30";
const NOW = new Date(`${TODAY}T12:00:00Z`);
const PROGRAM_ID = "22222222-2222-2222-2222-222222222222";

const WS_FREE: AllowanceWorkspace = {
  kind: "personal",
  orgType: null,
  plan: "free",
};
const WS_PLAYER: AllowanceWorkspace = {
  kind: "personal",
  orgType: null,
  plan: "player",
  planPeriodStart: "2027-01-14T00:00:00Z",
};
const WS_PLAYER_PRO: AllowanceWorkspace = { ...WS_PLAYER, plan: "player-pro" };
const WS_PLAYER_PAST_DUE: AllowanceWorkspace = {
  ...WS_PLAYER,
  planStatus: "past_due",
};
const WS_SEASON: AllowanceWorkspace = {
  kind: "team",
  orgType: "college",
  programPlan: {
    id: "program",
    term: "spring",
    startsOn: "2027-01-01",
    endsOn: "2027-05-31",
  },
};
const WS_FULL_YEAR: AllowanceWorkspace = {
  kind: "team",
  orgType: "college",
  programPlan: {
    id: "elite",
    term: "full_year",
    startsOn: "2026-08-01",
    endsOn: "2027-07-31",
  },
};
const WS_PILOT: AllowanceWorkspace = {
  kind: "team",
  orgType: "college",
  pilotEligible: true,
  pilotEndsOn: "2027-05-31",
  pilotEndedAt: null,
};
const WS_NO_PLAN: AllowanceWorkspace = { kind: "team", orgType: "college" };

const standing = (workspace: AllowanceWorkspace): PlanStanding =>
  planStandingFor(workspace, NOW);

const TEAM_USAGE: ProgramUsage = {
  usedSeconds: 58 * H,
  capSeconds: PROGRAM_SPRING_H * H,
  billingMonth: "2027-01-01",
  lines: [
    { userId: "u1", name: "Jordan Reyes", usedSeconds: 21 * H, matchCount: 12 },
    { userId: "u2", name: "Sam Okafor", usedSeconds: 19 * H, matchCount: 10 },
    { userId: "u3", name: "Diego Alvarez", usedSeconds: 18 * H, matchCount: 9 },
  ],
};
const TEAM_ROLES = new Map([
  ["u1", "coach"],
  ["u2", "player"],
  ["u3", "player"],
] as const);

const USAGE_MATCHES = [
  {
    id: "m1",
    opponent: "Lucas Moreno",
    date: "2027-01-18T00:00:00Z",
    seconds: 63 * M,
  },
  {
    id: "m2",
    opponent: "Ethan Park",
    date: "2027-01-09T00:00:00Z",
    seconds: 45 * M,
  },
];

const STATES: Record<string, State> = {
  "plan-free": {
    kind: "page",
    label: "Settings › Plan — Free",
    page: PAGE_FREE,
  },
  "plan-player": {
    kind: "page",
    label: "Settings › Plan — Player, monthly",
    page: PAGE_PLAYER,
  },
  "plan-player-pro": {
    kind: "page",
    label: "Settings › Plan — Player Pro",
    page: PAGE_PLAYER_PRO,
  },
  "plan-past-due": {
    kind: "page",
    label: "Settings › Plan — Player, the last payment failed",
    page: PAGE_PAST_DUE,
  },
  "plan-player-pro-change": {
    kind: "page",
    label: "MOCK — Settings › Plan, Player Pro with a quiet Change plan",
    page: { ...PAGE_PRO_FEB, mock: { kind: "change-plan", change: MOVE_DOWN } },
  },
  "plan-scheduled": {
    kind: "page",
    label: "MOCK — Settings › Plan, a move to Player waiting for Feb 14",
    page: { ...PAGE_PRO_FEB, mock: { kind: "scheduled", change: MOVE_DOWN } },
  },
  choose: {
    kind: "dialog",
    label: "Dialog — Choose a plan (30% off the first month)",
    page: PAGE_FREE,
    mode: { kind: "choose" },
    account: ACCOUNT_FREE,
  },
  "choose-yearly": {
    kind: "dialog",
    label:
      "Dialog — Choose a plan, arriving with ?plan=player-pro&period=yearly",
    page: PAGE_FREE,
    mode: { kind: "choose", plan: "player-pro", period: "yearly" },
    account: ACCOUNT_FREE,
  },
  "choose-returning": {
    kind: "dialog",
    label: "Dialog — Choose a plan, a returning subscriber (no discount)",
    page: PAGE_FREE,
    mode: { kind: "choose" },
    account: { ...ACCOUNT_FREE, firstMonthEligible: false },
  },
  hours: {
    kind: "dialog",
    label: "Dialog — Buy hours, Free",
    page: PAGE_FREE,
    mode: { kind: "hours" },
    account: ACCOUNT_FREE,
  },
  "hours-player": {
    kind: "dialog",
    label: "Dialog — Buy hours, Player",
    page: PAGE_PLAYER,
    mode: { kind: "hours" },
    account: ACCOUNT_PLAYER,
  },
  "paywall-free": {
    kind: "dialog",
    label: "Dialog — Upload paywall, Free player",
    page: PAGE_FREE,
    mode: { kind: "paywall", neededSeconds: NEEDED },
    account: ACCOUNT_FREE,
    wizard: true,
  },
  "paywall-player": {
    kind: "dialog",
    label: "Dialog — Upload paywall, Player out of hours",
    page: PAGE_PLAYER_SPENT,
    mode: { kind: "paywall", neededSeconds: NEEDED },
    account: ACCOUNT_PLAYER_SPENT,
    preview: PREVIEW_HOURS,
    wizard: true,
  },
  "paywall-player-pro": {
    kind: "dialog",
    label: "Dialog — Upload paywall, Player Pro out of hours",
    page: PAGE_PLAYER_PRO_SPENT,
    mode: { kind: "paywall", neededSeconds: NEEDED },
    account: ACCOUNT_PLAYER_PRO_SPENT,
    wizard: true,
  },
  upgrade: {
    kind: "dialog",
    label: "Dialog — Upgrade (credit by days)",
    page: PAGE_PLAYER,
    mode: { kind: "upgrade" },
    account: ACCOUNT_PLAYER,
    preview: PREVIEW_DAYS,
  },
  "upgrade-hours": {
    kind: "dialog",
    label: "Dialog — Upgrade (credit by hours)",
    page: PAGE_PLAYER_SPENT,
    mode: { kind: "upgrade" },
    account: ACCOUNT_PLAYER_SPENT,
    preview: PREVIEW_HOURS,
  },
  "upgrade-loading": {
    kind: "dialog",
    label: "Dialog — Upgrade, the price still loading",
    page: PAGE_PLAYER,
    mode: { kind: "upgrade" },
    account: ACCOUNT_PLAYER,
    preview: { status: "loading" },
  },
  "upgrade-refused": {
    kind: "dialog",
    label: "Dialog — Upgrade, refused (card needs updating, quote kept)",
    page: PAGE_PLAYER,
    mode: { kind: "upgrade" },
    account: ACCOUNT_PLAYER,
    // The quote stays on screen; only the sentence is added.
    preview: PREVIEW_DAYS,
    refusal: "Update your card before upgrading.",
  },
  "pay-yearly": {
    kind: "dialog",
    label: "Dialog — Pay yearly (Player, monthly → yearly)",
    page: PAGE_PLAYER,
    mode: { kind: "yearly" },
    account: ACCOUNT_PLAYER,
    preview: PREVIEW_YEARLY,
  },
  "paywall-past-due": {
    kind: "dialog",
    label: "Dialog — Upload paywall, Player whose last payment failed",
    page: PAGE_PAST_DUE,
    mode: { kind: "paywall", neededSeconds: NEEDED },
    account: ACCOUNT_PAST_DUE,
    wizard: true,
  },
  downgrade: {
    kind: "dialog",
    label: "MOCK — Dialog, move down to Player at renewal",
    page: { ...PAGE_PRO_FEB, mock: { kind: "change-plan", change: MOVE_DOWN } },
    mode: { kind: "change", change: MOVE_DOWN },
    account: ACCOUNT_PRO_FEB,
  },
  "downgrade-monthly": {
    kind: "dialog",
    label: "MOCK — Dialog, yearly → monthly at the year's renewal",
    page: PAGE_PLAYER_YEAR,
    mode: { kind: "change", change: PAY_MONTHLY },
    account: ACCOUNT_PLAYER_YEAR,
  },
  pending: {
    kind: "dialog",
    label: "Dialog — paid, not shown on the account yet",
    page: PAGE_FREE,
    mode: { kind: "choose" },
    account: ACCOUNT_FREE,
    pending: true,
  },
  "file-free": {
    kind: "file",
    label: "Upload wizard — file step, Free with no hours",
    plan: "free",
  },
  "file-player": {
    kind: "file",
    label:
      "Upload wizard — file step, Player with a video longer than what's left",
    plan: "player",
  },
  "file-past-due": {
    kind: "file",
    label: "Upload wizard — file step, Player whose last payment failed",
    plan: "player",
    pastDue: true,
  },
  "header-pill": {
    kind: "pill",
    label: "Header pill — every plan and team state",
  },
  "home-card": {
    kind: "home",
    label: "Home — the usage card for each plan and team state",
  },
  usage: {
    kind: "usage",
    label: "Settings › Usage — the personal card, Player and Free",
  },
  "team-hours": {
    kind: "team-hours",
    label: "Team page — Plan & hours: season, full year, pilot, no plan",
  },
  "team-meter": {
    kind: "team-meter",
    label: "Upload wizard — a team's footer meter: season, pilot",
  },
  "email-low": {
    kind: "email",
    label: "Email — 80% used, Player",
    email: "low",
  },
  "email-spent": {
    kind: "email",
    label: "Email — used up, Player",
    email: "spent",
  },
  "email-season-low": {
    kind: "email",
    label: "Email — 80% used, a program's season",
    email: "season-low",
  },
  "email-season-spent": {
    kind: "email",
    label: "Email — used up, a program's season",
    email: "season-spent",
  },
};

export function Plans2027Preview({
  state,
  emails = {},
}: {
  state: string | null;
  /** The usage emails, rendered on the server from the real templates. */
  emails?: Record<string, string>;
}) {
  const chosen = state ? STATES[state] : undefined;
  if (!chosen) return <Index unknown={state} />;

  if (chosen.kind === "file") {
    return <FileStepState plan={chosen.plan} pastDue={chosen.pastDue} />;
  }
  if (chosen.kind === "pill") return <PillStates label={chosen.label} />;
  if (chosen.kind === "home") return <HomeStates label={chosen.label} />;
  if (chosen.kind === "usage") return <UsageStates label={chosen.label} />;
  if (chosen.kind === "team-hours") {
    return <TeamHoursStates label={chosen.label} />;
  }
  if (chosen.kind === "team-meter") {
    return <TeamMeterStates label={chosen.label} />;
  }
  if (chosen.kind === "email") {
    return (
      <Frame label={chosen.label}>
        <EmailFrame label={chosen.label} html={emails[chosen.email] ?? ""} />
      </Frame>
    );
  }

  return (
    <main className="min-h-dvh bg-[var(--surface-card)] px-10 py-10">
      <p className="eyebrow">{chosen.label}</p>
      <div className="mt-6">
        <PlanSettings
          {...chosen.page}
          preview={chosen.page.plan === "player" ? PREVIEW_DAYS : undefined}
          yearlyPreview={PREVIEW_YEARLY}
        />
      </div>
      {chosen.kind === "dialog" && (
        <PlanCheckoutDialog
          open
          onOpenChange={noop}
          mode={chosen.mode}
          account={chosen.account}
          preview={chosen.preview}
          refusal={chosen.refusal}
          onDone={noop}
          paymentPending={chosen.pending}
          sendsAfterPay={chosen.wizard}
          onShortenTrim={chosen.wizard ? noop : undefined}
        />
      )}
    </main>
  );
}

function Index({ unknown }: { unknown: string | null }) {
  return (
    <main className="min-h-dvh bg-[var(--surface-card)] px-10 py-10">
      <p className="eyebrow">Design preview</p>
      <h1 className="text-display mt-3">Plans 2027</h1>
      <p className="text-body-sm mt-3 max-w-[520px]">
        Each surface on fixtures. Nothing here charges a card: checkout is not
        opened, and the upgrade&rsquo;s figures are fixed. The states marked
        MOCK draw a change at renewal that is not built: no page opens it and
        its button calls nothing.
        {unknown ? ` No state called "${unknown}".` : ""}
      </p>
      <ul className="mt-8 flex max-w-[640px] flex-col">
        {Object.entries(STATES).map(([id, entry]) => (
          <li
            key={id}
            className="border-t border-[var(--border-hairline)] py-2.5"
          >
            <Link
              href={`/design/plans-2027?state=${id}`}
              className="text-[13px] text-[var(--blue)] hover:text-[var(--blue-hover)]"
            >
              {entry.label}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

const PROBE = {
  width: 1920,
  height: 1080,
  durationSeconds: 6720,
  fps: 30,
  averageFps: 29.97,
  mimeType: "video/mp4",
  sizeBytes: 3_900_000_000,
} as VideoProbeSummary;

/** The real shell, file step and footer meter, with the note the wizard draws. */
function FileStepState({
  plan,
  pastDue = false,
}: {
  plan: "free" | "player";
  pastDue?: boolean;
}) {
  const withFile = plan === "player" && !pastDue;
  const remaining = plan === "player" && !pastDue ? 23 * M : 0;
  const note = fileStepHoursNote({
    enabled: true,
    plan,
    remainingSeconds: remaining,
    videoSeconds: withFile ? PROBE.durationSeconds : null,
    pastDue,
  });
  const suffix =
    meterSuffix({
      allowanceKind: plan === "player" ? "plan" : "none",
      resetsOn: pastDue ? null : RESETS_ON,
      pastDue,
    }) ?? "";

  return (
    <WizardShell
      stepIndex={1}
      stepCount={4}
      title={STEP_CONFIG_PROCESSING.file?.title}
      description={STEP_CONFIG_PROCESSING.file?.description}
      back={noop}
      meter={
        plan === "player" && !pastDue ? (
          <FooterMeter
            remainingSeconds={remaining}
            capSeconds={planHoursSeconds("player")}
            suffix={suffix}
            freeWord="plan"
            creditWord="extra"
            pilotNote={false}
          />
        ) : (
          <PlainReadout>{`0h · ${suffix}`}</PlainReadout>
        )
      }
      contentClassName="mt-[52px]"
      continueLabel={CONTINUE_LABEL.file}
      onContinue={noop}
      continueDisabled={!withFile}
    >
      <FileStepContent
        kind="processing"
        selectedProvider="splitstep"
        subjectFirstName={null}
        uploadedFile={
          withFile
            ? {
                name: "court-3-saturday.mp4",
                size: "3.9 GB",
                status: "ready",
              }
            : null
        }
        probe={withFile ? PROBE : null}
        warnings={[]}
        notes={[]}
        notices={[]}
        hoursNote={
          note.kind === "none" ? null : (
            <FileHoursNote note={note} onSeePlans={noop} />
          )
        }
        busy={false}
        error={null}
        parsingState={{
          isParsing: false,
          parseError: null,
          parseWarnings: [],
          parseSuccess: false,
        }}
        formData={{} as FormData}
        acceptString=".mp4,.mov,.m4v,.avi,.mkv,.webm"
        isOver={false}
        onDragOver={noop}
        onDragLeave={noop}
        onDrop={noop}
        onFileChange={noop}
        onRemove={noop}
      />
    </WizardShell>
  );
}

/* ---------- Stage F surfaces ---------- */

/** An email in an iframe sized to its own content, so no message is cut off. */
function EmailFrame({ label, html }: { label: string; html: string }) {
  const [height, setHeight] = useState(900);
  return (
    <iframe
      aria-label={label}
      srcDoc={html}
      scrolling="no"
      onLoad={(event) => {
        const doc = event.currentTarget.contentDocument;
        if (doc) setHeight(doc.documentElement.scrollHeight);
      }}
      style={{ height }}
      className="w-full max-w-[720px] rounded-[var(--radius-card)] border border-[var(--border-card)]"
    />
  );
}

function Frame({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-[var(--surface-card)] px-10 py-10">
      <p className="eyebrow">{label}</p>
      <div className="mt-6 flex flex-col gap-8">{children}</div>
    </main>
  );
}

function Case({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <span className="text-[11px] text-[var(--ink-500)]">{name}</span>
      {children}
    </section>
  );
}

/** The real pill with fixed hours. Hover one for its tooltip. */
function PillStates({ label }: { label: string }) {
  const cases: {
    name: string;
    workspace: AllowanceWorkspace;
    hours: React.ComponentProps<typeof PlanMeterPill>["hours"];
  }[] = [
    {
      name: "Free, no hours",
      workspace: WS_FREE,
      hours: { remainingSeconds: 0, capSeconds: 0 },
    },
    {
      name: "Free, with extra hours",
      workspace: WS_FREE,
      hours: {
        remainingSeconds: 0,
        capSeconds: 0,
        creditSeconds: 2 * H,
        nextCreditExpiresAt: "2027-10-16T00:00:00Z",
      },
    },
    {
      name: "Player",
      workspace: WS_PLAYER,
      hours: { remainingSeconds: 3 * H + 12 * M, capSeconds: 5 * H },
    },
    {
      name: "Player, with extra hours",
      workspace: WS_PLAYER,
      hours: {
        remainingSeconds: 3 * H + 12 * M,
        capSeconds: 5 * H,
        creditSeconds: 1 * H,
        nextCreditExpiresAt: "2027-10-16T00:00:00Z",
      },
    },
    {
      name: "Player, running low",
      workspace: WS_PLAYER,
      hours: { remainingSeconds: 48 * M, capSeconds: 5 * H },
    },
    {
      name: "Player, out of hours",
      workspace: WS_PLAYER,
      hours: { remainingSeconds: 0, capSeconds: 5 * H },
    },
    {
      name: "Player, the last payment failed",
      workspace: WS_PLAYER_PAST_DUE,
      hours: { remainingSeconds: 0, capSeconds: 0 },
    },
    {
      name: "Player Pro",
      workspace: WS_PLAYER_PRO,
      hours: { remainingSeconds: 7 * H + 40 * M, capSeconds: 10 * H },
    },
    {
      name: "A team on Program, spring",
      workspace: WS_SEASON,
      hours: {
        remainingSeconds: (PROGRAM_SPRING_H - 58) * H,
        capSeconds: PROGRAM_SPRING_H * H,
      },
    },
    {
      name: "A team on Elite, full year",
      workspace: WS_FULL_YEAR,
      hours: {
        remainingSeconds: (ELITE_YEAR_H - 90) * H,
        capSeconds: ELITE_YEAR_H * H,
      },
    },
    {
      name: "A pilot team",
      workspace: WS_PILOT,
      hours: { remainingSeconds: 61.5 * H, capSeconds: 75 * H },
    },
    {
      name: "A team with no plan",
      workspace: WS_NO_PLAN,
      hours: { remainingSeconds: 0, capSeconds: 0 },
    },
    { name: "Loading", workspace: WS_PLAYER, hours: "loading" },
    { name: "The read failed", workspace: WS_PLAYER, hours: null },
  ];
  return (
    <Frame label={label}>
      <div className="grid max-w-[720px] grid-cols-2 gap-x-10 gap-y-6">
        {cases.map((entry) => (
          <Case key={entry.name} name={entry.name}>
            <span>
              <PlanMeterPill
                standing={standing(entry.workspace)}
                hours={entry.hours}
                onClick={noop}
              />
            </span>
          </Case>
        ))}
      </div>
    </Frame>
  );
}

function HomeStates({ label }: { label: string }) {
  const personal = { owner: "Jordan Reyes", today: TODAY };
  const cards = [
    {
      name: "Player",
      view: homeCardView({
        ...personal,
        standing: standing(WS_PLAYER),
        usedSeconds: 1 * H + 48 * M,
        capSeconds: 5 * H,
        creditSeconds: 1 * H,
        analyzed: 6,
      }),
    },
    {
      name: "Player, the last payment failed",
      view: homeCardView({
        ...personal,
        standing: standing(WS_PLAYER_PAST_DUE),
        usedSeconds: 0,
        capSeconds: 0,
        analyzed: 6,
      }),
    },
    {
      name: "Free, first month still to take",
      view: homeCardView({
        ...personal,
        standing: standing(WS_FREE),
        usedSeconds: 0,
        capSeconds: 0,
        analyzed: 4,
        firstMonthEligible: true,
      }),
    },
    {
      name: "A team on Program, spring",
      view: homeCardView({
        standing: standing(WS_SEASON),
        owner: "Northfield University",
        programId: PROGRAM_ID,
        usedSeconds: 58 * H,
        capSeconds: PROGRAM_SPRING_H * H,
        analyzed: 31,
        today: TODAY,
      }),
    },
    {
      name: "A pilot team",
      view: homeCardView({
        standing: standing(WS_PILOT),
        owner: "University of Georgia",
        programId: PROGRAM_ID,
        usedSeconds: 13.5 * H,
        capSeconds: 75 * H,
        analyzed: 18,
        today: TODAY,
      }),
    },
    {
      name: "A team with no plan",
      view: homeCardView({
        standing: standing(WS_NO_PLAN),
        owner: "Northfield University",
        programId: PROGRAM_ID,
        usedSeconds: 0,
        capSeconds: 0,
        analyzed: 12,
        today: TODAY,
      }),
    },
    {
      name: "A team on Elite, full year",
      view: homeCardView({
        standing: standing(WS_FULL_YEAR),
        owner: "Northfield University",
        programId: PROGRAM_ID,
        usedSeconds: 90 * H,
        capSeconds: ELITE_YEAR_H * H,
        analyzed: 52,
        today: TODAY,
      }),
    },
  ];
  return (
    <Frame label={label}>
      <div className="grid max-w-[1000px] grid-cols-2 gap-6">
        {cards.map((card) => (
          <Case key={card.name} name={card.name}>
            <PlanHomeCard view={card.view} />
          </Case>
        ))}
      </div>
    </Frame>
  );
}

function UsageStates({ label }: { label: string }) {
  return (
    <Frame label={label}>
      <div className="flex max-w-[640px] flex-col gap-8">
        <Case name="Player, two matches this month, an extra hour">
          <PersonalUsageCard
            view={usageCardView({
              standing: standing(WS_PLAYER),
              usedSeconds: 1 * H + 48 * M,
              capSeconds: 5 * H,
              creditSeconds: 1 * H,
              nextCreditExpiresAt: "2027-10-16T00:00:00Z",
              matches: USAGE_MATCHES,
            })}
          />
        </Case>
        <Case name="Player, the last payment failed">
          <PersonalUsageCard
            view={usageCardView({
              standing: standing(WS_PLAYER_PAST_DUE),
              usedSeconds: 0,
              capSeconds: 0,
              creditSeconds: 0,
              nextCreditExpiresAt: null,
              matches: [],
            })}
          />
        </Case>
        <Case name="Free, nothing analyzed">
          <PersonalUsageCard
            view={usageCardView({
              standing: standing(WS_FREE),
              usedSeconds: 0,
              capSeconds: 0,
              creditSeconds: 0,
              nextCreditExpiresAt: null,
              matches: [],
            })}
          />
        </Case>
      </div>
    </Frame>
  );
}

function TeamHoursStates({ label }: { label: string }) {
  const cases = [
    {
      name: "Program, spring",
      workspace: WS_SEASON,
      usage: TEAM_USAGE,
    },
    {
      name: "Elite, full year",
      workspace: WS_FULL_YEAR,
      usage: {
        ...TEAM_USAGE,
        usedSeconds: 90 * H,
        capSeconds: ELITE_YEAR_H * H,
      },
    },
    {
      name: "A pilot",
      workspace: WS_PILOT,
      usage: { ...TEAM_USAGE, usedSeconds: 13.5 * H, capSeconds: 75 * H },
    },
    {
      name: "No plan",
      workspace: WS_NO_PLAN,
      usage: { ...TEAM_USAGE, usedSeconds: 0, capSeconds: 0, lines: [] },
    },
  ];
  return (
    <Frame label={label}>
      <div className="flex max-w-[640px] flex-col gap-8">
        {cases.map((entry) => (
          <Case key={entry.name} name={entry.name}>
            <PlanHoursCard
              view={planHoursView({
                standing: standing(entry.workspace),
                usedSeconds: entry.usage.usedSeconds,
                capSeconds: entry.usage.capSeconds,
              })}
              usage={entry.usage}
              pendingSeconds={0}
              roles={TEAM_ROLES}
              viewerId="u1"
            />
          </Case>
        ))}
      </div>
    </Frame>
  );
}

/** The wizard's real footer meter, with the suffix a team gets from January 1. */
function TeamMeterStates({ label }: { label: string }) {
  const cases = [
    {
      name: "Program, spring",
      workspace: WS_SEASON,
      left: (PROGRAM_SPRING_H - 58) * H,
      cap: PROGRAM_SPRING_H * H,
    },
    { name: "A pilot", workspace: WS_PILOT, left: 61.5 * H, cap: 75 * H },
  ];
  return (
    <Frame label={label}>
      {cases.map((entry) => (
        <Case key={entry.name} name={entry.name}>
          <span className="flex">
            <FooterMeter
              remainingSeconds={entry.left}
              capSeconds={entry.cap}
              suffix={teamMeterSuffix(standing(entry.workspace)) ?? ""}
              pilotNote={false}
            />
          </span>
        </Case>
      ))}
    </Frame>
  );
}
