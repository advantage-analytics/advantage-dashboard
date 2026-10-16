"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { advButton } from "@/lib/ui/adv-button";
import { StatePill } from "@/components/ui/state-pill";
import {
  SETTINGS_FACT_FIGURE,
  SettingsCard,
  SettingsCardFootnote,
  SettingsCardTitle,
} from "@/components/dashboard/settings/settings-card";
import {
  HOURS_FILL,
  HoursMeter,
} from "@/components/dashboard/settings/teams/program-hours-summary";
import {
  formatHoursLong,
  hoursSeverity,
  usageFraction,
} from "@/lib/data/usage-format";

type Stage = "pilot" | "paid";
type Billing = "monthly" | "yearly";

type Plan = {
  id: string;
  name: string;
  hours: string;
  note: string;
  monthly: number;
  yearly: number;
};

/**
 * Personal plans only until December: team plans stay off this page while the
 * fall pilot runs. Draft January 2027 prices, the same as the landing site's
 * /design/pricing.
 */
const PLANS: readonly Plan[] = [
  {
    id: "free",
    name: "Free",
    hours: "1 match",
    note: "Once, up to 2 hours",
    monthly: 0,
    yearly: 0,
  },
  {
    id: "player",
    name: "Player",
    hours: "3h a month",
    note: "About 2 matches",
    monthly: 29,
    yearly: 290,
  },
  {
    id: "player-pro",
    name: "Player Pro",
    hours: "5h a month",
    note: "About 4 matches",
    monthly: 49,
    yearly: 490,
  },
];

const CREDITS = [
  { hours: "1 hour", note: "About one match", price: 14 },
  { hours: "5 hours", note: "$12 an hour", price: 60 },
] as const;

const H = 3600;

/** Fixed account states the mock can show. */
const STATE = {
  pilot: { used: 0.8 * H, cap: 2 * H, resets: "Nov 1", ends: "Dec 31" },
  paid: {
    current: "player",
    used: 1.8 * H,
    cap: 3 * H,
    credits: 2,
    renews: "Feb 1",
  },
} as const;

const usd = (n: number) =>
  `$${n.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;

const BTN_PRIMARY = advButton("primary", "sm");
const BTN_SECONDARY = advButton("outline", "sm");

export function PlansPreview() {
  const [stage, setStage] = useState<Stage>("pilot");
  const [out, setOut] = useState(false);
  const [billing, setBilling] = useState<Billing>("monthly");

  return (
    <main className="min-h-screen bg-[var(--surface-card)]">
      <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-page)] px-8 py-3">
        <div className="mx-auto flex max-w-[968px] flex-wrap items-center gap-3">
          <span className="text-[12px] text-[var(--ink-600)]">
            Design preview of Settings › Plan. Fixed numbers, nothing is
            charged.
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Segmented
              value={stage}
              onChange={setStage}
              options={[
                { v: "pilot", t: "Now, during the pilot" },
                { v: "paid", t: "From January" },
              ]}
            />
            <Segmented
              value={out ? "out" : "left"}
              onChange={(v) => setOut(v === "out")}
              options={[
                { v: "left", t: "Hours left" },
                { v: "out", t: "Out of hours" },
              ]}
            />
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1032px] flex-col gap-10 px-6 py-8 sm:px-8 sm:py-10">
        <header className="flex flex-col gap-3">
          <h1 className="text-display">Plan</h1>
          <p className="text-body-sm max-w-[520px]">
            What you pay and how much match video it covers.
          </p>
        </header>

        <div className="flex max-w-[640px] flex-col gap-5">
          {stage === "pilot" ? (
            <PilotView out={out} billing={billing} setBilling={setBilling} />
          ) : (
            <PaidView out={out} billing={billing} setBilling={setBilling} />
          )}
        </div>
      </div>
    </main>
  );
}

/**
 * Today through Dec 31: the pilot's free 2 hours a month (covered by the video
 * vendor until January 1), with January's plans at list price.
 */
function PilotView({
  out,
  billing,
  setBilling,
}: {
  out: boolean;
  billing: Billing;
  setBilling: (b: Billing) => void;
}) {
  const s = STATE.pilot;
  const used = out ? s.cap : s.used;
  return (
    <>
      <Facts
        facts={[
          { label: "Plan", value: "Free pilot" },
          { label: "Price", value: "Free" },
          { label: "Free through", value: s.ends },
        ]}
      />

      <HoursCard
        used={used}
        cap={s.cap}
        resets={s.resets}
        footnote="The pilot gives you 2 free hours of film every month until January 1. Your plan isn't billed before then."
      />

      {out && (
        <div className="flex flex-col gap-3 rounded-[14px] border border-[var(--warning-border)] bg-[var(--warning-bg)] px-6 py-[18px] sm:flex-row sm:items-center">
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium text-[var(--ink-900)]">
              You&apos;ve used this month&apos;s 2 free hours.
            </span>
            <span className="mt-0.5 block text-[12px] leading-[1.5] text-[var(--ink-600)]">
              They come back on {s.resets}. To film another match before then,
              buy credits below.
            </span>
          </span>
          <a href="#credits" className={BTN_PRIMARY}>
            Buy credits
          </a>
        </div>
      )}

      {out && (
        <CreditPacks note="Paid now, separately from your plan. Credits last 12 months, so any you don't use carry into January." />
      )}

      <SettingsCard>
        <SettingsCardTitle
          className="pb-2"
          trailing={<BillingSwitch value={billing} onChange={setBilling} />}
        >
          Plans from January
        </SettingsCardTitle>
        {PLANS.filter((p) => p.monthly > 0).map((p) => (
          <PlanRow
            key={p.id}
            plan={p}
            billing={billing}
            action={
              <button type="button" className={BTN_PRIMARY}>
                Choose
              </button>
            }
          />
        ))}
        <SettingsCardFootnote className="mt-0 border-t-0 pt-0">
          Choose a plan now and it starts on January 1, when the free pilot
          hours end. Your plan isn&apos;t billed before then. Your matches and
          reports stay either way.
        </SettingsCardFootnote>
      </SettingsCard>
    </>
  );
}

/** From January: on Player, with credits and upgrades. */
function PaidView({
  out,
  billing,
  setBilling,
}: {
  out: boolean;
  billing: Billing;
  setBilling: (b: Billing) => void;
}) {
  const s = STATE.paid;
  const used = out ? s.cap : s.used;
  const currentIndex = PLANS.findIndex((p) => p.id === s.current);
  const current = PLANS[currentIndex];
  const next = PLANS[currentIndex + 1];

  return (
    <>
      <Facts
        facts={[
          { label: "Plan", value: current.name },
          { label: "Price", value: `${usd(current.monthly)} / mo` },
          { label: "Renews", value: s.renews },
        ]}
      />

      <HoursCard
        used={used}
        cap={s.cap}
        resets={s.renews}
        credits={s.credits}
      />

      {out && next && (
        <div className="flex flex-col gap-3 rounded-[14px] border border-[var(--warning-border)] bg-[var(--warning-bg)] px-6 py-[18px] sm:flex-row sm:items-center">
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium text-[var(--ink-900)]">
              You&apos;ve used this month&apos;s 3 hours.
            </span>
            <span className="mt-0.5 block text-[12px] leading-[1.5] text-[var(--ink-600)]">
              Your {s.credits} hours of credits are being used now. Or move to{" "}
              {next.name} for {next.hours} at {usd(next.monthly)} a month.
            </span>
          </span>
          <button type="button" className={BTN_PRIMARY}>
            Upgrade to {next.name}
          </button>
        </div>
      )}

      <SettingsCard>
        <SettingsCardTitle
          className="pb-2"
          trailing={<BillingSwitch value={billing} onChange={setBilling} />}
        >
          Change plan
        </SettingsCardTitle>
        {PLANS.map((p, i) => (
          <PlanRow
            key={p.id}
            plan={p}
            billing={billing}
            current={p.id === s.current}
            action={
              p.id === s.current ? null : (
                <button
                  type="button"
                  className={i > currentIndex ? BTN_PRIMARY : BTN_SECONDARY}
                >
                  {i > currentIndex ? "Upgrade" : "Switch"}
                </button>
              )
            }
          />
        ))}
        <SettingsCardFootnote className="mt-0 border-t-0 pt-0">
          Yearly is 10 months&apos; price for 12. Changes start on your next
          billing date.
        </SettingsCardFootnote>
      </SettingsCard>

      <CreditPacks />
    </>
  );
}

/** Hours you buy once, used after plan or pilot hours run out. */
function CreditPacks({ note }: { note?: string }) {
  return (
    <div id="credits">
      <SettingsCard>
        <SettingsCardTitle className="pb-2">Credit packs</SettingsCardTitle>
        {CREDITS.map((c) => (
          <div
            key={c.hours}
            className="flex items-center gap-4 border-t border-[var(--border-hairline)] py-3"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-medium text-[var(--ink-900)]">
                {c.hours}
              </span>
              <span className="mt-0.5 block text-[11px] text-[var(--ink-500)]">
                {c.note}
              </span>
            </span>
            <span className="tabular shrink-0 text-[13px] text-[var(--ink-900)]">
              {usd(c.price)}
            </span>
            <span className="flex w-[96px] shrink-0 justify-end">
              <button type="button" className={BTN_SECONDARY}>
                Buy
              </button>
            </span>
          </div>
        ))}
        {note && (
          <SettingsCardFootnote className="mt-0 border-t-0 pt-0">
            {note}
          </SettingsCardFootnote>
        )}
      </SettingsCard>
    </div>
  );
}

/** What you're on: the same facts strip the live page uses. */
function Facts({ facts }: { facts: { label: string; value: string }[] }) {
  return (
    <SettingsCard className="overflow-hidden p-0">
      <dl className="grid divide-y divide-[var(--border-hairline)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {facts.map((f) => (
          <div
            key={f.label}
            className="flex min-w-0 flex-col gap-1.5 px-6 py-5"
          >
            <dt className="eyebrow whitespace-nowrap">{f.label}</dt>
            <dd
              className={cn(
                SETTINGS_FACT_FIGURE,
                "tabular whitespace-nowrap text-[var(--ink-900)]",
              )}
            >
              {f.value}
            </dd>
          </div>
        ))}
      </dl>
    </SettingsCard>
  );
}

/**
 * This month's video, led by what is left (Settings › Teams' quota rule):
 * blue, amber from 80%, red at the cap, always with a word beside the figure.
 */
function HoursCard({
  used,
  cap,
  resets,
  credits,
  footnote,
}: {
  used: number;
  cap: number;
  resets: string;
  credits?: number;
  footnote?: string;
}) {
  const fraction = usageFraction(used, cap);
  const severity = hoursSeverity(fraction);
  const fill = HOURS_FILL[severity];
  const figureColor = severity === "ok" ? "var(--ink-900)" : fill;

  return (
    <SettingsCard className="gap-3.5">
      <SettingsCardTitle
        trailing={
          <span className="text-[11px] text-[var(--ink-500)]">
            Resets {resets}
          </span>
        }
      >
        Video this month
      </SettingsCardTitle>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-title-lg" style={{ color: figureColor }}>
          {formatHoursLong(cap - used)}
        </span>
        <span className="text-[12px] text-[var(--ink-500)]">
          left of {formatHoursLong(cap)}
        </span>
        {severity !== "ok" && (
          <span
            className="ml-1 flex items-center gap-1.5 text-[11px]"
            style={{ color: fill }}
          >
            <AlertTriangle
              className="size-3"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            {severity === "spent" ? "Plan hours spent" : "Running low"}
          </span>
        )}
      </div>
      <HoursMeter
        usedSeconds={used}
        capSeconds={cap}
        fraction={fraction}
        fill={fill}
        label="Video used this month"
      />
      {credits !== undefined ? (
        <div className="flex items-center gap-3 border-t border-[var(--border-hairline)] pt-3.5">
          <span className="min-w-0 flex-1 text-[12px] text-[var(--ink-900)]">
            {credits > 0 ? `${credits}h in credits` : "No credits"}
            <span className="mt-0.5 block text-[11px] text-[var(--ink-500)]">
              Used after your plan hours run out. Credits last 12 months.
            </span>
          </span>
          <a href="#credits" className={BTN_SECONDARY}>
            Buy credits
          </a>
        </div>
      ) : (
        footnote && (
          <SettingsCardFootnote className="mt-0">
            {footnote}
          </SettingsCardFootnote>
        )
      )}
    </SettingsCard>
  );
}

function PlanRow({
  plan,
  billing,
  current = false,
  action,
}: {
  plan: Plan;
  billing: Billing;
  current?: boolean;
  action: React.ReactNode;
}) {
  const yearly = billing === "yearly";
  const list = yearly ? plan.yearly : plan.monthly;
  const unit = yearly ? "yr" : "mo";
  const free = plan.monthly === 0;

  return (
    <div className="flex items-center gap-4 border-t border-[var(--border-hairline)] py-3.5">
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-[12px] font-medium text-[var(--ink-900)]">
          {plan.name}
          {current && <StatePill>Current</StatePill>}
        </span>
        <span className="mt-0.5 block text-[11px] leading-[1.5] text-[var(--ink-500)]">
          {plan.hours} · {plan.note}
        </span>
      </span>
      <span className="tabular shrink-0 text-[13px] text-[var(--ink-900)]">
        {free ? "Free" : `${usd(list)} / ${unit}`}
      </span>
      <span className="flex w-[96px] shrink-0 justify-end">
        {action ?? (
          <span className="text-[11px] text-[var(--ink-500)]">Your plan</span>
        )}
      </span>
    </div>
  );
}

function BillingSwitch({
  value,
  onChange,
}: {
  value: Billing;
  onChange: (b: Billing) => void;
}) {
  return (
    <Segmented
      value={value}
      onChange={onChange}
      options={[
        { v: "monthly", t: "Monthly" },
        { v: "yearly", t: "Yearly" },
      ]}
    />
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly { v: T; t: string }[];
}) {
  return (
    <div className="inline-flex gap-0.5 rounded-[8px] bg-[var(--surface-subtle)] p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          aria-pressed={value === o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            "h-7 rounded-[6px] px-2.5 text-[12px] font-medium transition-colors duration-150",
            value === o.v
              ? "bg-[var(--surface-card)] text-[var(--ink-900)] shadow-[var(--shadow-card)]"
              : "text-[var(--ink-500)] hover:text-[var(--ink-900)]",
          )}
        >
          {o.t}
        </button>
      ))}
    </div>
  );
}
