"use client";

import {
  ArrowRight,
  Check,
  CheckCircle2,
  Info,
  Scissors,
  TriangleAlert,
  X,
  XCircle,
} from "lucide-react";
import {
  SettingsCard,
  SettingsCardFootnote,
  SettingsCardRow,
  SettingsCardTitle,
} from "@/components/dashboard/settings/settings-card";
import { FooterMeter } from "@/components/dashboard/matches/new-match-wizard/FooterMeter";
import {
  errorStripCls,
  ghostBtnCls,
  noteIconCls,
  noteStripCls,
  primaryBtnCls,
} from "@/components/dashboard/matches/new-match-wizard/styles";
import { StatePill } from "@/components/ui/state-pill";
import { ConfirmAside } from "@/components/ui/confirm-dialog";
import { LiveDots } from "@/components/ui/live-dots";
import { formatHoursLong } from "@/lib/data/usage-format";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import {
  type AccountState,
  type CreditPack,
  creditsLeft,
  FREE_ENDS,
  freeLeft,
  MONTH,
  NEW_PACK_EXPIRES,
  PACKS,
  RESETS_ON,
  STATES,
  totalLeft,
  VIDEO,
} from "./fixture";

/* ------------------------------------------------------------------------ */
/* Page scaffolding                                                          */
/* ------------------------------------------------------------------------ */

const SECTIONS = [
  { id: "plan", label: "A · Settings › Plan" },
  { id: "wizard", label: "B · Upload wizard" },
  { id: "header", label: "C · Header meter" },
  { id: "home", label: "D · Home" },
  { id: "usage", label: "E · Settings › Usage" },
  { id: "checkout", label: "F · Checkout copy" },
  { id: "notes", label: "G · Open decisions" },
] as const;

function Section({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-16 flex-col gap-6">
      <div>
        <h2 className="text-[15px] font-medium text-[var(--ink-900)]">
          {title}
        </h2>
        {intro && (
          <p className="mt-1 max-w-[70ch] text-[12px] leading-[1.6] text-[var(--ink-600)]">
            {intro}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

/** One labelled frame. `id` is the name to quote back when picking. */
function Frame({
  id,
  label,
  children,
  bare = false,
  className,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  /** No surrounding page wash — for frames that already are a card. */
  bare?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2.5", className)}>
      <h3 className="flex items-baseline gap-2 text-[12px] text-[var(--ink-600)]">
        <span className="mono text-[11px] text-[var(--ink-400)]">{id}</span>
        {label}
      </h3>
      {bare ? (
        children
      ) : (
        <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--border-medium)] bg-[var(--surface-page)] p-4 sm:p-6">
          {children}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Shared bits                                                               */
/* ------------------------------------------------------------------------ */

const usd = (n: number) => `$${n}`;
const perHour = (p: CreditPack) =>
  `$${Math.round(p.priceUsd / p.hours)} an hour`;
const packName = (p: CreditPack) =>
  `${p.hours} ${p.hours === 1 ? "hour" : "hours"}`;

type Severity = "ok" | "low" | "spent";

/**
 * Severity of the whole balance. Credits count: a player whose free hours are
 * spent but who holds credits is not "low" — they can still upload.
 */
function severityOf(s: AccountState): Severity {
  const left = totalLeft(s);
  if (left <= 0) return "spent";
  if (creditsLeft(s) === 0 && left <= s.freeCapSeconds * 0.2) return "low";
  return "ok";
}

const SEVERITY_FILL: Record<Severity, string> = {
  ok: "var(--blue)",
  low: "var(--viz-key)",
  spent: "var(--danger)",
};

/**
 * One bar, two buckets: free hours left (Signal Blue) then credits left (a
 * lighter step of the same blue). Width is the free allowance plus the credit
 * balance, so a big credit balance does not shrink the free segment to nothing
 * — the free part is drawn at its own cap's share.
 */
function TwoBucketMeter({ s }: { s: AccountState }) {
  const free = freeLeft(s);
  const credits = creditsLeft(s);
  const whole = s.freeCapSeconds + credits;
  const sev = severityOf(s);
  const freeFill = sev === "low" ? SEVERITY_FILL.low : "var(--blue)";
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={whole}
      aria-valuenow={free + credits}
      aria-label="Video hours left"
      className="flex h-1.5 overflow-hidden rounded-[3px]"
      style={{ background: "var(--blue-soft)" }}
    >
      <div
        className="h-full"
        style={{ width: `${(free / whole) * 100}%`, background: freeFill }}
      />
      {credits > 0 && (
        <div
          className="h-full border-l border-white"
          style={{
            width: `${(credits / whole) * 100}%`,
            background: "var(--viz-you-mid)",
          }}
        />
      )}
    </div>
  );
}

function Legend({ color, children }: { color: string; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="size-[7px] rounded-[2px]"
        style={{ background: color }}
        aria-hidden
      />
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------------ */
/* A · Settings › Plan                                                       */
/* ------------------------------------------------------------------------ */

function HoursCard({ s, pilot = false }: { s: AccountState; pilot?: boolean }) {
  const free = freeLeft(s);
  const credits = creditsLeft(s);
  const sev = severityOf(s);
  const figureColor = sev === "ok" ? "var(--ink-900)" : SEVERITY_FILL[sev];
  const nextExpiry = s.credits[0]?.expiresOn;

  return (
    <SettingsCard className="gap-3.5 bg-[var(--surface-card)]">
      <SettingsCardTitle
        trailing={
          <span className="text-[11px] text-[var(--ink-500)]">
            Free hours reset {RESETS_ON}
          </span>
        }
      >
        Video hours
      </SettingsCardTitle>

      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-title-lg" style={{ color: figureColor }}>
          {sev === "spent" ? "0h" : formatHoursLong(free + credits)}
        </span>
        <span className="text-[12px] text-[var(--ink-500)]">left</span>
        {sev !== "ok" && (
          <span
            className="ml-1 flex items-center gap-1.5 text-[11px]"
            style={{ color: SEVERITY_FILL[sev] }}
          >
            <TriangleAlert className="size-3" strokeWidth={1.75} aria-hidden />
            {sev === "low"
              ? "Running low"
              : `Spent — free hours come back ${RESETS_ON}`}
          </span>
        )}
      </div>

      <TwoBucketMeter s={s} />

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[var(--ink-600)]">
        <Legend color={sev === "low" ? SEVERITY_FILL.low : "var(--blue)"}>
          {`Free: ${formatHoursLong(free)} of ${formatHoursLong(s.freeCapSeconds)} this month`}
        </Legend>
        <Legend color="var(--viz-you-mid)">
          {credits > 0
            ? `Credits: ${formatHoursLong(credits)}`
            : "Credits: none"}
        </Legend>
      </div>

      <SettingsCardFootnote>
        {pilot ? "Pilot: 10 free hours a month" : "2 free hours a month"}{" "}
        through {FREE_ENDS}, used first. Credits are used after them, oldest
        first
        {nextExpiry ? ` — your next credits expire ${nextExpiry}.` : "."}
      </SettingsCardFootnote>
    </SettingsCard>
  );
}

function PacksCard({ highlight }: { highlight?: CreditPack["id"] }) {
  return (
    <SettingsCard className="bg-[var(--surface-card)]">
      <SettingsCardTitle className="mb-3">Buy video hours</SettingsCardTitle>
      {PACKS.map((p) => (
        <SettingsCardRow
          key={p.id}
          label={
            <span className="flex items-center gap-2">
              {packName(p)}
              {highlight === p.id && <StatePill>Covers this video</StatePill>}
            </span>
          }
          description={`${perHour(p)} · lasts 12 months`}
          control={
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-[var(--ink-900)]">
                {usd(p.priceUsd)}
              </span>
              <button type="button" className={advButton("outline", "sm")}>
                Buy
              </button>
            </div>
          }
        />
      ))}
      <SettingsCardFootnote className="mt-0 border-t-0 pt-1">
        Credits are used after your free hours. Unused credits carry past{" "}
        {FREE_ENDS}. All sales final.
      </SettingsCardFootnote>
    </SettingsCard>
  );
}

/** Variant: the packs collapsed to one quiet line until hours run low. */
function PacksLine() {
  return (
    <SettingsCard className="bg-[var(--surface-card)] py-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex-1 text-[12px] text-[var(--ink-700)]">
          Need more than your free hours? Credit packs start at $14 an hour.
        </span>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[12px] text-[var(--blue)] hover:text-[var(--blue-hover)]"
        >
          See packs
          <ArrowRight className="size-3" strokeWidth={1.75} aria-hidden />
        </button>
      </div>
    </SettingsCard>
  );
}

function HistoryCard({ s }: { s: AccountState }) {
  return (
    <SettingsCard className="bg-[var(--surface-card)]">
      <SettingsCardTitle className="mb-3">Credit history</SettingsCardTitle>
      {s.credits.length === 0 ? (
        <p className="border-t border-[var(--border-hairline)] pt-3 text-[11px] text-[var(--ink-500)]">
          No credits bought yet.
        </p>
      ) : (
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="eyebrow-sm text-[var(--ink-500)]">
              <th className="pb-2 font-normal">Bought</th>
              <th className="pb-2 font-normal">Pack</th>
              <th className="pb-2 text-right font-normal">Left</th>
              <th className="pb-2 text-right font-normal">Expires</th>
            </tr>
          </thead>
          <tbody>
            {s.credits.map((lot) => (
              <tr
                key={lot.boughtOn}
                className="border-t border-[var(--border-hairline)] text-[var(--ink-900)]"
              >
                <td className="py-2.5">{lot.boughtOn}</td>
                <td className="py-2.5">
                  {lot.pack === "1h" ? "1 hour" : "5 hours"}
                </td>
                <td className="tabular py-2.5 text-right">
                  {formatHoursLong(lot.remainingSeconds)}
                </td>
                <td className="py-2.5 text-right text-[var(--ink-600)]">
                  {lot.expiresOn}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SettingsCard>
  );
}

function PlanSection() {
  return (
    <Section
      id="plan"
      title="A · Settings › Plan"
      intro="The page that owns hours and credits. One hours card with one meter — free hours, then credits — and the packs beneath. No January plans shown until they're decided."
    >
      <div className="grid gap-8 lg:grid-cols-2">
        {(["fresh", "low", "carried", "spent"] as const).map((k, i) => (
          <Frame key={k} id={`A1.${i + 1}`} label={STATES[k].label}>
            <HoursCard s={STATES[k]} />
          </Frame>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Frame
          id="A2a"
          label="Full pack card — shown only once hours are low or spent"
        >
          <PacksCard />
        </Frame>
        <Frame id="A2b" label="PICKED — one line while hours remain">
          <div className="flex flex-col gap-4">
            <PacksLine />
            <span className="text-[11px] text-[var(--ink-400)]">
              …becomes the full pack card (A2a) once the balance is low or
              spent.
            </span>
          </div>
        </Frame>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Frame id="A3.1" label="Credit history — with purchases">
          <HistoryCard s={STATES.expiring} />
        </Frame>
        <Frame id="A3.2" label="Credit history — empty">
          <HistoryCard s={STATES.fresh} />
        </Frame>
        <Frame id="A4" label={STATES.pilot.label}>
          <HoursCard s={STATES.pilot} pilot />
        </Frame>
        <Frame id="A5" label="Back from checkout — the page's first line">
          <div className="flex flex-col gap-4">
            <div className={noteStripCls} role="status">
              <CheckCircle2
                className={cn(noteIconCls, "text-[var(--ink-400)]")}
                strokeWidth={1.5}
                aria-hidden
              />
              <span>
                <span className="font-medium text-[var(--ink-900)]">
                  5 hours added.
                </span>{" "}
                They last until {NEW_PACK_EXPIRES}. A receipt is on its way to
                your email.
              </span>
            </div>
            <HoursCard s={STATES.carried} />
          </div>
        </Frame>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------------ */
/* B · Upload wizard                                                         */
/* ------------------------------------------------------------------------ */

/** The wizard footer, minus the real step logic. */
function WizardFooter({
  meter,
  continueDisabled = false,
}: {
  meter: React.ReactNode;
  continueDisabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-y-3 border-t border-[var(--border-hairline)] bg-[var(--surface-card)] px-5 py-3.5">
      <button type="button" className="text-[13px] text-[var(--ink-600)]">
        Cancel
      </button>
      {meter}
      <span className="flex-1" />
      <div className="flex gap-2">
        <button type="button" className={ghostBtnCls}>
          Back
        </button>
        <button
          type="button"
          className={primaryBtnCls}
          disabled={continueDisabled}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

/** The trim step's body, abbreviated to the part these frames change. */
function TrimStub({ seconds }: { seconds: number }) {
  return (
    <div className="flex flex-col gap-2 px-5 pt-5 pb-4">
      <span className="text-[13px] font-medium text-[var(--ink-900)]">
        Trim the match
      </span>
      <div className="relative h-10 rounded-[6px] bg-[var(--ink-100)]">
        <div className="absolute inset-y-0 right-[14%] left-[8%] rounded-[6px] border-2 border-[var(--blue)] bg-[var(--blue-soft)]" />
      </div>
      <span className="mono text-[11px] text-[var(--ink-500)]">
        Window {formatHoursLong(seconds)}
      </span>
    </div>
  );
}

/** Footer readout once a video can spill into credits. */
function SplitReadout({
  freeSeconds,
  creditSeconds,
}: {
  freeSeconds: number;
  creditSeconds: number;
}) {
  return (
    <span className="ml-3 inline-flex items-center gap-2.5 border-l border-[var(--border-medium)] pl-4">
      <span className="inline-flex h-[3px] w-14 overflow-hidden rounded-[2px] bg-[var(--ink-100)]">
        <span className="h-full w-[30%] bg-[var(--viz-you-light)]" />
        <span className="h-full w-[60%] bg-[var(--viz-you-mid)]" />
      </span>
      <span className="mono tabular text-[11px] whitespace-nowrap text-[var(--ink-500)]">
        Spends {formatHoursLong(freeSeconds + creditSeconds)} ·{" "}
        {formatHoursLong(freeSeconds)} free + {formatHoursLong(creditSeconds)}{" "}
        credits
      </span>
    </span>
  );
}

function ShortRefusalStrip({ needed, left }: { needed: number; left: number }) {
  return (
    <div className={errorStripCls} role="alert">
      <XCircle className={noteIconCls} strokeWidth={1.5} aria-hidden />
      <span>
        <span className="font-medium">
          This video needs {formatHoursLong(needed)}. You have{" "}
          {formatHoursLong(left)} left.
        </span>{" "}
        Add hours to send it now, shorten the trim, or wait for your free hours
        on {RESETS_ON}.
      </span>
    </div>
  );
}

/** The inline offer — neutral, never red: the refusal above is the bad news. */
function InlinePackOffer({ shortBy }: { shortBy: number }) {
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-element)] border border-[var(--border-card)] bg-[var(--surface-card)] p-4">
      <span className="text-[12px] text-[var(--ink-700)]">
        You&rsquo;re {formatHoursLong(shortBy)} short.
      </span>
      <div className="grid gap-2 sm:grid-cols-2">
        {PACKS.map((p, i) => (
          <button
            key={p.id}
            type="button"
            className={cn(
              "flex flex-col items-start gap-0.5 rounded-[8px] border px-3 py-2.5 text-left transition-colors duration-200 hover:bg-[var(--surface-subtle)]",
              i === 0
                ? "border-[var(--blue)] shadow-[0_0_0_1px_var(--blue)]"
                : "border-[var(--border-field)]",
            )}
          >
            <span className="text-[13px] font-medium text-[var(--ink-900)]">
              {packName(p)} · {usd(p.priceUsd)}
            </span>
            <span className="text-[11px] text-[var(--ink-500)]">
              {perHour(p)} · lasts 12 months
            </span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" className={advButton("primary", "sm")}>
          Buy 1 hour · $14
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-[12px] text-[var(--blue)] hover:text-[var(--blue-hover)]"
        >
          <Scissors className="size-3.5" strokeWidth={1.5} aria-hidden />
          Shorten the trim
        </button>
      </div>
      <span className="text-[11px] text-[var(--ink-500)]">
        Checkout opens here; your trim and video stay put.
      </span>
    </div>
  );
}

/* B3b variations — "bolder" passes on the dialog. Each stays inside the
   system: Signal Blue as the one accent, the 24px/300 settings figure, the
   brand mesh the beta pill already owns, one primary per dialog. */

const NEEDED = VIDEO.long;
const FREE_NOW = freeLeft(STATES.low);
const SHORT_BY = NEEDED - FREE_NOW;
const SPARE = PACKS[0].hours * 3600 - SHORT_BY;

/** The dimmed wizard behind a dialog, so each variant reads in place. */
function DialogStage({
  children,
  tall = false,
}: {
  children: React.ReactNode;
  tall?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[var(--radius-card)]",
        tall ? "min-h-[720px]" : "min-h-[540px]",
      )}
    >
      <div aria-hidden className="opacity-40">
        <div className="rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)]">
          <TrimStub seconds={NEEDED} />
          <WizardFooter
            meter={
              <FooterMeter
                remainingSeconds={FREE_NOW}
                capSeconds={STATES.low.freeCapSeconds}
                selectedSeconds={NEEDED}
                suffix="resets on the 1st"
              />
            }
          />
        </div>
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-black/20 p-4">
        {children}
      </div>
    </div>
  );
}

function DialogShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="dialog"
      aria-label="Add video hours"
      className={cn(
        "relative w-full max-w-[440px] overflow-hidden rounded-[var(--radius-modal)] bg-[var(--surface-card)] shadow-[var(--shadow-floating)]",
        className,
      )}
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute top-4 right-4 z-10 text-[var(--ink-400)] hover:text-[var(--ink-700)]"
      >
        <X className="size-4" strokeWidth={1.5} />
      </button>
      {children}
    </div>
  );
}

function TrimLink({
  children = "Shorten the trim instead",
}: {
  children?: string;
}) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 text-[12px] text-[var(--blue)] hover:text-[var(--blue-hover)]"
    >
      <Scissors className="size-3.5" strokeWidth={1.5} aria-hidden />
      {children}
    </button>
  );
}

/** 1 — The gap, measured. The shortfall IS the headline, drawn to scale. */
function DialogGap() {
  const freeShare = (FREE_NOW / NEEDED) * 100;
  return (
    <DialogShell className="p-7">
      <span className="text-title-lg block" style={{ color: "var(--ink-900)" }}>
        {formatHoursLong(SHORT_BY)} short
      </span>
      <p className="mt-1 text-[12px] leading-[1.6] text-[var(--ink-600)]">
        This match runs {formatHoursLong(NEEDED)}. Your free hours cover the
        first {formatHoursLong(FREE_NOW)}.
      </p>

      {/* The video to scale: free hours, then the gap the pack fills. */}
      <div className="mt-6">
        <div className="flex h-3 overflow-hidden rounded-[3px] bg-[var(--blue-soft)]">
          <div
            className="h-full bg-[var(--blue)]"
            style={{ width: `${freeShare}%` }}
          />
          <div
            className="h-full border-l-2 border-white"
            style={{
              width: `${100 - freeShare}%`,
              background:
                "repeating-linear-gradient(135deg, var(--viz-you-mid) 0 6px, var(--viz-you-light) 6px 12px)",
            }}
          />
        </div>
        <div className="mono tabular mt-2 flex justify-between text-[11px] text-[var(--ink-500)]">
          <span>{formatHoursLong(FREE_NOW)} free</span>
          <span>{formatHoursLong(SHORT_BY)} from credits</span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-2.5">
        {PACKS.map((p, i) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={i === 0}
            className={cn(
              "flex flex-col items-start gap-1 rounded-[10px] border px-4 py-3.5 text-left transition-colors duration-200",
              i === 0
                ? "border-[var(--blue)] shadow-[0_0_0_1px_var(--blue)]"
                : "border-[var(--border-field)] hover:bg-[var(--surface-subtle)]",
            )}
          >
            <span className="text-[12px] text-[var(--ink-600)]">
              {packName(p)}
            </span>
            <span className="text-title-lg" style={{ color: "var(--ink-900)" }}>
              {usd(p.priceUsd)}
            </span>
            <span className="text-[11px] text-[var(--ink-500)]">
              {i === 0 ? `${formatHoursLong(SPARE)} left over` : perHour(p)}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <TrimLink />
        <button type="button" className={advButton("primary", "md")}>
          Pay $14 and send
        </button>
      </div>
    </DialogShell>
  );
}

/** 2 — Brand band. The beta pill's mesh carries the moment; ink text on it. */
/**
 * `white` sets the band's copy in white, like the beta pill. The mesh alone is
 * too light for white body text (about 2:1 on its palest blue), so a Signal
 * Blue (hover step) scrim deepens it toward the bottom, where the copy sits,
 * to roughly 4:1 behind the sentence.
 */
function DialogBand({ white = false }: { white?: boolean }) {
  const ink = white ? "#ffffff" : "var(--ink-900)";
  return (
    <DialogShell>
      <div className="brand-mesh-gradient relative px-7 pt-7 pb-6">
        {white && (
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(170deg, rgba(37,99,235,0.35) 0%, rgba(37,99,235,0.8) 100%)",
            }}
          />
        )}
        <div className="relative">
          <span
            className={cn(
              "inline-flex h-5 items-center rounded-full px-2 text-[9px] font-medium tracking-[0.08em] uppercase",
              white ? "bg-white/25" : "bg-white/40",
            )}
            style={{ color: ink }}
          >
            Beta
          </span>
          <h4 className="text-title-lg mt-3" style={{ color: ink }}>
            Send this match today
          </h4>
          <p
            className={cn(
              "mt-1 text-[12px] leading-[1.6]",
              white && "font-medium",
            )}
            style={{ color: ink, opacity: white ? 0.92 : 0.8 }}
          >
            It needs {formatHoursLong(NEEDED)}. Add hours and it goes straight
            to Advantage Intelligence.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 px-7 pt-5">
        {PACKS.map((p, i) => (
          <label
            key={p.id}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-[8px] border px-3.5 py-3",
              i === 0
                ? "border-[var(--blue)] shadow-[0_0_0_1px_var(--blue)]"
                : "border-[var(--border-field)]",
            )}
          >
            <span
              className={cn(
                "size-3.5 rounded-full border",
                i === 0
                  ? "border-[4px] border-[var(--blue)]"
                  : "border-[var(--ink-300)]",
              )}
              aria-hidden
            />
            <span className="flex-1 text-[13px] text-[var(--ink-900)]">
              {packName(p)}
              <span className="ml-2 text-[11px] text-[var(--ink-500)]">
                {perHour(p)}
              </span>
            </span>
            <span className="text-[13px] font-medium text-[var(--ink-900)]">
              {usd(p.priceUsd)}
            </span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-7 pt-5 pb-7">
        <TrimLink />
        <button type="button" className={advButton("primary", "md")}>
          Pay $14
        </button>
      </div>
    </DialogShell>
  );
}

/**
 * 5 — In the beta dialog's own style (`beta-welcome-dialog.tsx`): 520px, the
 * brand band with the live dot grid, white logo and tag, 40px light display
 * line, a headline figure over a white hairline, then the v3 Dialog body —
 * hairline rows, the aside, quiet link left and one primary right.
 */
function DialogBetaStyle() {
  return (
    <div
      role="dialog"
      aria-label="Add video hours"
      className="w-full overflow-hidden bg-[var(--surface-card)]"
      style={{
        maxWidth: "520px",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-floating)",
      }}
    >
      <div className="brand-mesh-gradient relative overflow-hidden px-7 pt-6 pb-7 text-white">
        <LiveDots />
        <div className="relative flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- static mock */}
          <img
            src="/logos/logo.svg"
            alt="Advantage"
            className="h-[18px] w-auto brightness-0 invert"
          />
          <span className="inline-flex h-[20px] items-center rounded-full bg-white/20 px-2 text-[10px] font-medium tracking-[0.08em] text-white uppercase">
            Beta
          </span>
          <span className="flex-1" />
          <button
            type="button"
            aria-label="Close"
            className="flex size-7 items-center justify-center rounded-[var(--radius-element)] text-white/75 hover:bg-white/15 hover:text-white"
          >
            <X className="size-3.5" strokeWidth={1.5} aria-hidden />
          </button>
        </div>

        <h4 className="relative mt-9 text-[40px] leading-[1.02] font-light tracking-[-1px]">
          One more hour
          <br />
          and it&rsquo;s in.
        </h4>
        <p className="relative mt-3 max-w-[40ch] text-[13px] leading-[1.6] text-white/90">
          This match needs {formatHoursLong(NEEDED)}. Your free hours cover{" "}
          {formatHoursLong(FREE_NOW)} of it.
        </p>

        <div className="relative mt-7 flex items-end gap-3 border-t border-white/25 pt-5">
          <span className="tabular text-[56px] leading-[0.85] font-light tracking-[-2px]">
            48m
          </span>
          <span className="pb-1 text-[13px] leading-[1.35] text-white/85">
            short of what
            <br />
            this match needs
          </span>
          <span className="flex-1" />
          <span className="pb-1 text-right text-[11px] leading-[1.45] text-white/90">
            Free hours return {RESETS_ON}
            <br />
            Credits last 12 months
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-6 px-7 pt-6 pb-7">
        {/* Boxed selection: two tiles, the chosen one in Signal Blue with the
            pressed wash behind it and the check in its corner. */}
        <div
          role="radiogroup"
          aria-label="Pack"
          className="grid grid-cols-2 gap-2.5"
        >
          {PACKS.map((p, i) => {
            const chosen = i === 0;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={chosen}
                className={cn(
                  "relative flex flex-col items-start gap-1 rounded-[10px] border px-4 pt-3.5 pb-3 text-left transition-colors duration-200",
                  chosen
                    ? "border-[var(--blue)] bg-[var(--blue-pressed)] shadow-[0_0_0_1px_var(--blue)]"
                    : "border-[var(--border-field)] hover:bg-[var(--surface-subtle)]",
                )}
              >
                <span
                  className={cn(
                    "absolute top-3 right-3 flex size-4 items-center justify-center rounded-full",
                    chosen
                      ? "bg-[var(--blue)]"
                      : "border border-[var(--ink-300)]",
                  )}
                  aria-hidden
                >
                  {chosen && (
                    <Check className="size-2.5 text-white" strokeWidth={3} />
                  )}
                </span>
                <span className="text-[12px] text-[var(--ink-700)]">
                  {packName(p)}
                </span>
                <span
                  className="text-title-lg tabular"
                  style={{ color: "var(--ink-900)" }}
                >
                  {usd(p.priceUsd)}
                </span>
                <span className="text-[11px] text-[var(--ink-500)]">
                  {chosen
                    ? `Covers it, ${formatHoursLong(SPARE)} to spare`
                    : perHour(p)}
                </span>
              </button>
            );
          })}
        </div>

        <ConfirmAside>
          All sales final. Credits are used after your free hours, oldest first.
        </ConfirmAside>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            className="text-[12px] text-[var(--blue)] hover:text-[var(--blue-hover)]"
          >
            Shorten the trim instead
          </button>
          <span className="flex-1" />
          <button type="button" className={advButton("primary", "md")}>
            Pay $14 and send
            <ArrowRight className="size-3.5" strokeWidth={1.5} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

/** 3 — One decision. The pack that covers it, alone and big; the rest is text. */
function DialogOneTap() {
  return (
    <DialogShell className="p-7">
      <h4 className="text-[15px] font-medium text-[var(--ink-900)]">
        Add 1 hour to send this match
      </h4>
      <p className="mt-1 text-[12px] leading-[1.6] text-[var(--ink-600)]">
        You&rsquo;re {formatHoursLong(SHORT_BY)} short of the{" "}
        {formatHoursLong(NEEDED)} it needs.
      </p>

      <div className="mt-5 flex items-end justify-between rounded-[10px] border border-[var(--blue)] px-5 py-4 shadow-[0_0_0_1px_var(--blue)]">
        <div>
          <span
            className="text-title-lg block"
            style={{ color: "var(--ink-900)" }}
          >
            1 hour
          </span>
          <span className="text-[11px] text-[var(--ink-500)]">
            Covers it, {formatHoursLong(SPARE)} to spare · lasts 12 months
          </span>
        </div>
        <span className="text-title-lg" style={{ color: "var(--ink-900)" }}>
          $14
        </span>
      </div>

      <button
        type="button"
        className={cn(advButton("primary", "lg"), "mt-4 w-full")}
      >
        Pay $14 and send
      </button>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[12px]">
        <button
          type="button"
          className="text-[var(--blue)] hover:text-[var(--blue-hover)]"
        >
          5 hours for $60 instead ($12 an hour)
        </button>
        <TrimLink>Shorten the trim</TrimLink>
      </div>
    </DialogShell>
  );
}

/** 4 — The ledger. What happens to the hours, line by line, before paying. */
function DialogLedger() {
  const rows: [string, string, boolean?][] = [
    ["This match", formatHoursLong(NEEDED)],
    ["Free hours left this month", `− ${formatHoursLong(FREE_NOW)}`],
    ["From the 1-hour pack", `− ${formatHoursLong(SHORT_BY)}`],
    ["Credits left after", formatHoursLong(SPARE), true],
  ];
  return (
    <DialogShell className="p-7">
      <h4 className="text-[15px] font-medium text-[var(--ink-900)]">
        Add hours to send this match
      </h4>

      <div
        role="radiogroup"
        aria-label="Pack"
        className="mt-4 inline-flex rounded-full bg-[var(--surface-subtle)] p-[3px]"
      >
        {PACKS.map((p, i) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={i === 0}
            className={cn(
              "h-8 rounded-full px-4 text-[12px] transition-colors duration-200",
              i === 0
                ? "bg-[var(--surface-card)] font-medium text-[var(--ink-900)] shadow-[var(--shadow-card)]"
                : "text-[var(--ink-600)] hover:text-[var(--ink-900)]",
            )}
          >
            {packName(p)} · {usd(p.priceUsd)}
          </button>
        ))}
      </div>

      <dl className="mt-5 flex flex-col">
        {rows.map(([k, v, total]) => (
          <div
            key={k}
            className={cn(
              "flex items-baseline justify-between py-2.5 text-[12px]",
              total
                ? "border-t border-[var(--ink-900)]"
                : "border-t border-[var(--border-hairline)]",
            )}
          >
            <dt
              className={
                total
                  ? "font-medium text-[var(--ink-900)]"
                  : "text-[var(--ink-600)]"
              }
            >
              {k}
            </dt>
            <dd
              className={cn(
                "tabular",
                total
                  ? "text-title-lg"
                  : "mono text-[12px] text-[var(--ink-900)]",
              )}
              style={total ? { color: "var(--ink-900)" } : undefined}
            >
              {v}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <TrimLink />
        <button type="button" className={advButton("primary", "md")}>
          Pay $14
        </button>
      </div>
      <p className="mt-3 text-[11px] text-[var(--ink-500)]">
        All sales final. Credits last 12 months.
      </p>
    </DialogShell>
  );
}

function PackDialog() {
  const needed = VIDEO.long;
  const left = freeLeft(STATES.low);
  return (
    <div className="relative min-h-[480px] overflow-hidden rounded-[var(--radius-card)]">
      {/* The wizard behind, dimmed. */}
      <div aria-hidden className="opacity-40">
        <div className="rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)]">
          <TrimStub seconds={needed} />
          <WizardFooter
            meter={
              <FooterMeter
                remainingSeconds={left}
                capSeconds={STATES.low.freeCapSeconds}
                selectedSeconds={needed}
                suffix="resets on the 1st"
              />
            }
          />
        </div>
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-black/20 p-4">
        <div
          role="dialog"
          aria-label="Add video hours"
          className="relative w-full max-w-[420px] rounded-[var(--radius-modal)] bg-[var(--surface-card)] p-6 shadow-[var(--shadow-floating)]"
        >
          <button
            type="button"
            aria-label="Close"
            className="absolute top-4 right-4 text-[var(--ink-400)]"
          >
            <X className="size-4" strokeWidth={1.5} />
          </button>
          <h4 className="text-[15px] font-medium text-[var(--ink-900)]">
            Add hours to send this video
          </h4>
          <p className="mt-1.5 text-[12px] leading-[1.6] text-[var(--ink-600)]">
            It needs {formatHoursLong(needed)}; you have {formatHoursLong(left)}{" "}
            free this month. Credits cover the rest and last 12 months.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            {PACKS.map((p, i) => (
              <label
                key={p.id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-[8px] border px-3 py-2.5",
                  i === 0
                    ? "border-[var(--blue)] shadow-[0_0_0_1px_var(--blue)]"
                    : "border-[var(--border-field)]",
                )}
              >
                <span
                  className={cn(
                    "size-3.5 rounded-full border",
                    i === 0
                      ? "border-[4px] border-[var(--blue)]"
                      : "border-[var(--ink-300)]",
                  )}
                  aria-hidden
                />
                <span className="flex-1">
                  <span className="block text-[13px] text-[var(--ink-900)]">
                    {packName(p)}
                  </span>
                  <span className="block text-[11px] text-[var(--ink-500)]">
                    {perHour(p)}
                  </span>
                </span>
                <span className="text-[13px] text-[var(--ink-900)]">
                  {usd(p.priceUsd)}
                </span>
              </label>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-[12px] text-[var(--blue)] hover:text-[var(--blue-hover)]"
            >
              <Scissors className="size-3.5" strokeWidth={1.5} aria-hidden />
              Shorten the trim instead
            </button>
            <button type="button" className={advButton("primary", "md")}>
              Pay $14
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function WizardSection() {
  const needed = VIDEO.long;
  const lowLeft = freeLeft(STATES.low);
  return (
    <Section
      id="wizard"
      title="B · Upload wizard — the paywall"
      intro="The only hard gate. It appears on the trim step, when the trimmed length is more than free hours plus credits. Reading matches and SwingVision imports never hit it, and neither does attaching a video to an existing match (that spends no hours)."
    >
      <div className="flex max-w-[832px] flex-col gap-8">
        <Frame id="B1" label="Fits in free hours — today's footer, unchanged">
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)]">
            <TrimStub seconds={VIDEO.short} />
            <WizardFooter
              meter={
                <FooterMeter
                  remainingSeconds={STATES.fresh.freeCapSeconds}
                  capSeconds={STATES.fresh.freeCapSeconds}
                  selectedSeconds={VIDEO.short}
                  suffix="resets on the 1st"
                />
              }
            />
          </div>
        </Frame>
        <Frame
          id="B2"
          label="Spills into credits — still a plain footer, says the split"
        >
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)]">
            <TrimStub seconds={needed} />
            <WizardFooter
              meter={
                <SplitReadout
                  freeSeconds={lowLeft}
                  creditSeconds={needed - lowLeft}
                />
              }
            />
          </div>
        </Frame>
      </div>

      <div className="flex max-w-[832px] flex-col gap-8">
        <Frame
          id="B3a"
          label="Doesn't fit — INLINE: refusal strip, then the offer in the step"
        >
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)]">
            <TrimStub seconds={needed} />
            <div className="flex flex-col gap-3 px-5 pb-5">
              <ShortRefusalStrip needed={needed} left={lowLeft} />
              <InlinePackOffer shortBy={needed - lowLeft} />
            </div>
            <WizardFooter
              continueDisabled
              meter={
                <FooterMeter
                  remainingSeconds={lowLeft}
                  capSeconds={STATES.low.freeCapSeconds}
                  selectedSeconds={needed}
                  suffix="resets on the 1st"
                />
              }
            />
          </div>
        </Frame>
        <Frame
          id="B3b"
          label="PICKED — DIALOG: Continue stays on and opens it (first draft)"
        >
          <PackDialog />
        </Frame>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Frame
          id="B3b.1"
          label="Bolder · The gap, measured — the shortfall is the headline, drawn to scale"
        >
          <DialogStage>
            <DialogGap />
          </DialogStage>
        </Frame>
        <Frame
          id="B3b.2"
          label="Bolder · Brand band — the beta pill's mesh carries the moment"
        >
          <DialogStage>
            <DialogBand />
          </DialogStage>
        </Frame>
        <Frame
          id="B3b.2w"
          label="Brand band, white text — the mesh deepened with a Signal Blue scrim so white reads"
        >
          <DialogStage>
            <DialogBand white />
          </DialogStage>
        </Frame>
        <Frame
          id="B3b.5"
          label="PICKED — beta-dialog style, packs as boxed selection tiles"
        >
          <DialogStage tall>
            <DialogBetaStyle />
          </DialogStage>
        </Frame>
        <Frame
          id="B3b.3"
          label="Bolder · One decision — the pack that covers it, alone and big"
        >
          <DialogStage>
            <DialogOneTap />
          </DialogStage>
        </Frame>
        <Frame
          id="B3b.4"
          label="Bolder · The ledger — where every minute comes from, before paying"
        >
          <DialogStage>
            <DialogLedger />
          </DialogStage>
        </Frame>
      </div>

      <Frame
        id="B4"
        label="All spent, no credits — said on the file step, before anyone waits on an upload"
        className="max-w-[832px]"
      >
        <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] p-5">
          <div className={errorStripCls} role="alert">
            <XCircle className={noteIconCls} strokeWidth={1.5} aria-hidden />
            <span>
              <span className="font-medium">
                You&rsquo;re out of video hours.
              </span>{" "}
              Free hours come back {RESETS_ON}, or add credits to send a match
              now.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={advButton("outline", "sm")}>
              Add hours
            </button>
            <span className="text-[11px] text-[var(--ink-500)]">
              From $14 · SwingVision imports are always free
            </span>
          </div>
        </div>
      </Frame>
    </Section>
  );
}

/* ------------------------------------------------------------------------ */
/* C · Header meter                                                          */
/* ------------------------------------------------------------------------ */

function Ring({ share, color }: { share: number; color: string }) {
  const r = 6;
  const c = 2 * Math.PI * r;
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-3.5 shrink-0 -rotate-90"
      aria-hidden
    >
      <circle
        cx="8"
        cy="8"
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.3)"
        strokeWidth="2"
      />
      {share > 0 && (
        <circle
          cx="8"
          cy="8"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={`${c * share} ${c}`}
        />
      )}
    </svg>
  );
}

/** `BetaMeterPill`'s geometry, with the states credits add. */
function MockPill({
  share,
  ringColor = "white",
  children,
}: {
  share: number;
  ringColor?: string;
  children: React.ReactNode;
}) {
  return (
    <span className="brand-mesh-gradient inline-flex h-7 items-center gap-2 rounded-full pr-3 pl-1 text-white shadow-[0_1px_2px_rgba(59,130,246,0.35)]">
      <span className="inline-flex h-5 items-center rounded-full bg-white/25 px-2 text-[9px] font-medium tracking-[0.08em] uppercase">
        Beta
      </span>
      <Ring share={share} color={ringColor} />
      <span className="tabular text-[12px] text-white/85">{children}</span>
    </span>
  );
}

function MockTooltip({ title, detail }: { title: string; detail: string }) {
  return (
    <span className="mt-2 inline-flex max-w-[260px] flex-col gap-0.5 rounded-[6px] bg-[var(--surface-dark)] px-2.5 py-1.5 text-[11px] leading-[1.5] text-white shadow-[var(--shadow-tooltip)]">
      <span className="font-medium">{title}</span>
      <span className="text-white/70">{detail}</span>
    </span>
  );
}

function HeaderSection() {
  const pills: {
    id: string;
    label: string;
    pill: React.ReactNode;
    title: string;
    detail: string;
  }[] = [
    {
      id: "C1",
      label: "Plenty left",
      pill: (
        <MockPill share={0.8}>
          <span className="font-medium text-white">1.6h</span> left
        </MockPill>
      ),
      title: "Free during the beta",
      detail: "1.6 of 2 free hours left this month. Click for Plan.",
    },
    {
      id: "C2",
      label: "Running low — PICKED: the ring stays white, the tooltip says it",
      pill: (
        <MockPill share={0.2}>
          <span className="font-medium text-white">0.4h</span> left
        </MockPill>
      ),
      title: "Running low",
      detail: `0.4 of 2 free hours left. They reset ${RESETS_ON}, or add credits on Plan.`,
    },
    {
      id: "C3",
      label: "Free spent, credits left — the figure is credits",
      pill: (
        <MockPill share={1}>
          <span className="font-medium text-white">3.7h</span> credits
        </MockPill>
      ),
      title: "Using your credits",
      detail: `Free hours are used for ${MONTH}. 3h 40m in credits left.`,
    },
    {
      id: "C4",
      label: "All spent",
      pill: (
        <MockPill share={0}>
          <span className="font-medium text-white">Out of hours</span>
        </MockPill>
      ),
      title: "Out of video hours",
      detail: `Free hours come back ${RESETS_ON}. Click to add credits.`,
    },
  ];
  return (
    <Section
      id="header"
      title="C · Header meter"
      intro="Same pill, ring always white. What changes: a credits state, and the click goes to Settings › Plan instead of the beta dialog. No modal from the header."
    >
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {pills.map((p) => (
          <Frame key={p.id} id={p.id} label={p.label}>
            <div className="flex flex-col items-start">
              {p.pill}
              <MockTooltip title={p.title} detail={p.detail} />
            </div>
          </Frame>
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------------ */
/* D · Home                                                                  */
/* ------------------------------------------------------------------------ */

function HomeFooterLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-hairline)] pt-3 text-[11px] text-[var(--ink-600)]">
      {children}
    </div>
  );
}

function BlueLink({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="text-[11px] text-[var(--blue)] hover:text-[var(--blue-hover)]"
    >
      {children}
    </button>
  );
}

function HomeSection() {
  return (
    <Section
      id="home"
      title="D · Home"
      intro="PICKED: both — the usage footer and the title's subline say it. Nothing new on the page until hours are spent."
    >
      <div className="grid gap-8 lg:grid-cols-2">
        <Frame id="D1" label="Free spent, credits carry it — usage footer">
          <HomeFooterLine>
            <span
              className="size-3.5 rounded-full border-2 border-[var(--viz-you-mid)]"
              aria-hidden
            />
            <span>Free hours used for {MONTH} · 3h 40m in credits</span>
          </HomeFooterLine>
        </Frame>
        <Frame id="D2" label="All spent — usage footer plus one link">
          <HomeFooterLine>
            <span
              className="size-3.5 rounded-full border-2 border-[var(--ink-200)]"
              aria-hidden
            />
            <span>Out of video hours · free hours come back {RESETS_ON}</span>
            <span className="text-[var(--border-medium)]">|</span>
            <BlueLink>Add hours</BlueLink>
          </HomeFooterLine>
        </Frame>
        <Frame id="D3" label="Title subline, all spent">
          <div>
            <div className="text-[22px] font-light text-[var(--ink-900)]">
              Fall 2026
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--ink-500)]">
              12 matches analyzed · Out of video hours ·{" "}
              <BlueLink>Add hours</BlueLink>
            </div>
          </div>
        </Frame>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------------ */
/* E · Settings › Usage                                                      */
/* ------------------------------------------------------------------------ */

function UsageSection() {
  const s = STATES.carried;
  return (
    <Section
      id="usage"
      title="E · Settings › Usage"
      intro="Usage keeps the ledger; Plan owns buying. The personal card shows both buckets and sends people to Plan rather than repeating the packs."
    >
      <Frame
        id="E1"
        label="Your analysis time — free spent, credits left"
        className="lg:max-w-[calc(50%-16px)]"
      >
        <SettingsCard className="gap-3 bg-[var(--surface-card)]">
          <SettingsCardTitle
            trailing={
              <span className="mono text-[11px] text-[var(--ink-500)]">
                {formatHoursLong(s.freeUsedSeconds)} /{" "}
                {formatHoursLong(s.freeCapSeconds)} free
              </span>
            }
          >
            Your analysis time
          </SettingsCardTitle>
          <TwoBucketMeter s={s} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--ink-500)]">
            <span>
              Credits: {formatHoursLong(creditsLeft(s))} · next expire{" "}
              {s.credits[0]?.expiresOn}
            </span>
            <span className="flex-1" />
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[var(--blue)] hover:text-[var(--blue-hover)]"
            >
              Manage on Plan
              <ArrowRight className="size-3" strokeWidth={1.75} aria-hidden />
            </button>
          </div>
          <SettingsCardFootnote>
            Personal uploads only · Free hours reset {RESETS_ON} · Free through{" "}
            {FREE_ENDS}
          </SettingsCardFootnote>
        </SettingsCard>
      </Frame>
    </Section>
  );
}

/* ------------------------------------------------------------------------ */
/* F · Checkout copy                                                         */
/* ------------------------------------------------------------------------ */

function CheckoutSection() {
  const rows: [string, string][] = [
    ["Product", "Advantage Intelligence — 1 video hour"],
    [
      "Description",
      "1 hour of Advantage Intelligence video analysis. Expires 12 months after purchase. All sales final.",
    ],
    ["Price", "$14.00 one-time"],
    ["Card statement", "ADVANTAGE INTELLIGENCE"],
    ["Opens as", "Stripe Embedded Checkout, inside the dialog / Plan page"],
    ["Comes back to", "The same wizard step, trim and file kept"],
  ];
  return (
    <Section
      id="checkout"
      title="F · Checkout copy"
      intro="What Stripe shows. Text only — for wording review."
    >
      <Frame id="F1" label="1-hour pack" className="lg:max-w-[calc(50%-16px)]">
        <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2.5 text-[12px]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-[var(--ink-500)]">{k}</dt>
              <dd className="text-[var(--ink-900)]">{v}</dd>
            </div>
          ))}
        </dl>
      </Frame>
    </Section>
  );
}

/* ------------------------------------------------------------------------ */
/* G · Open decisions                                                        */
/* ------------------------------------------------------------------------ */

const NOTES: { title: string; body: string }[] = [
  {
    title: "Checkout must not leave the wizard",
    body: "The picked video is an in-memory file. A full-page redirect to Stripe loses it, and the player would have to pick the file and trim again. So checkout runs embedded (in the dialog, B3b, or in place, B3a), never as a redirect from the wizard. Plan page can redirect.",
  },
  {
    title: "Shared house pool removed",
    body: 'The 20h open-beta ceiling was a misreading. Each personal player\'s hours are their own; teams use their own budget. The build deletes the ceiling and its "fully booked" copy.',
  },
  {
    title: "Credits are personal",
    body: "Credits belong to the user and spend only in their personal workspace. Teams keep their own budget, paid by the owner.",
  },
  {
    title: "Refunds — decided",
    body: "All sales final. Said in the pack footnote, the dialog and the Stripe description.",
  },
  {
    title: "Before taking money",
    body: "Stripe Tax ON (decided) · all-sales-final line at checkout · Vercel Hobby forbids commercial use, so move to Pro first · the Stripe webhook currently sets plan='pro' on every completed checkout and must branch on the session's metadata.",
  },
  {
    title: "Credits come back when analysis doesn't happen",
    body: "Cancelled while queued, vendor failure, or a shorter final trim returns the hours to the same packs they came from.",
  },
];

function NotesSection() {
  return (
    <Section id="notes" title="G · Open decisions">
      <div className="grid gap-4 lg:grid-cols-2">
        {NOTES.map((n) => (
          <div
            key={n.title}
            className="flex gap-2.5 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-3.5 py-3"
          >
            <Info
              className="mt-0.5 size-[13px] shrink-0 text-[var(--ink-400)]"
              strokeWidth={1.5}
              aria-hidden
            />
            <div className="text-[12px] leading-[1.6]">
              <div className="font-medium text-[var(--ink-900)]">{n.title}</div>
              <div className="text-[var(--ink-700)]">{n.body}</div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------------ */

export function CreditsPreview() {
  return (
    <main className="min-h-screen bg-[var(--surface-card)]">
      <nav className="sticky top-0 z-10 border-b border-[var(--border-hairline)] bg-[var(--surface-card)]/95 px-4 py-2.5 backdrop-blur sm:px-10">
        <div className="flex gap-4 overflow-x-auto text-[12px] whitespace-nowrap">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="text-[var(--ink-600)] hover:text-[var(--ink-900)]"
            >
              {s.label}
            </a>
          ))}
        </div>
      </nav>
      <div className="mx-auto flex max-w-[1200px] flex-col gap-16 px-4 py-10 sm:px-10">
        <header>
          <h1 className="text-[20px] font-medium text-[var(--ink-900)]">
            Credit packs — beta pricing mockups
          </h1>
          <p className="mt-2 max-w-[72ch] text-[12px] leading-[1.6] text-[var(--ink-600)]">
            Until {FREE_ENDS}: every personal workspace gets 2 free hours a
            month (pilot players 10). After that, players buy credit packs — 1
            hour for $14 or 5 for $60 — that last 12 months and are spent after
            the free hours. Each frame has an id (A1.2, B3a…) to quote when
            picking or changing one.
          </p>
        </header>
        <PlanSection />
        <WizardSection />
        <HeaderSection />
        <HomeSection />
        <UsageSection />
        <CheckoutSection />
        <NotesSection />
      </div>
    </main>
  );
}
