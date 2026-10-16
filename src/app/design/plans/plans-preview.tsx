"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { advButton } from "@/lib/ui/adv-button";
import {
  SETTINGS_FACT_FIGURE,
  SettingsCard,
  SettingsCardTitle,
} from "@/components/dashboard/settings/settings-card";

type Kind = "player" | "team";
type Billing = "monthly" | "yearly";

type Plan = {
  id: string;
  name: string;
  hours: string;
  note: string;
  monthly: number;
  yearly: number;
  yearlyUnit: "yr" | "season";
};

/** Draft January 2027 prices, the same as the landing site's preview. */
const PLANS: Record<Kind, readonly Plan[]> = {
  player: [
    {
      id: "free",
      name: "Free",
      hours: "1 match",
      note: "Once, up to 2 hours",
      monthly: 0,
      yearly: 0,
      yearlyUnit: "yr",
    },
    {
      id: "player",
      name: "Player",
      hours: "3 h a month",
      note: "About 2 matches",
      monthly: 29,
      yearly: 290,
      yearlyUnit: "yr",
    },
    {
      id: "player-pro",
      name: "Player Pro",
      hours: "5 h a month",
      note: "About 4 matches",
      monthly: 49,
      yearly: 490,
      yearlyUnit: "yr",
    },
  ],
  team: [
    {
      id: "coach",
      name: "Coach",
      hours: "15 h a month",
      note: "Shared by up to 10 players",
      monthly: 149,
      yearly: 1490,
      yearlyUnit: "yr",
    },
    {
      id: "program-lite",
      name: "Program Lite",
      hours: "25 h a month",
      note: "The whole roster",
      monthly: 299,
      yearly: 1500,
      yearlyUnit: "season",
    },
    {
      id: "program",
      name: "Program",
      hours: "50 h a month",
      note: "The whole roster",
      monthly: 549,
      yearly: 2750,
      yearlyUnit: "season",
    },
  ],
};

const CREDITS = [
  { hours: "1 hour", note: "About one match", price: 14 },
  { hours: "5 hours", note: "$12 an hour", price: 60 },
] as const;

/** Fixed account states the mock can show. */
const STATE: Record<
  Kind,
  {
    current: string;
    renews: string;
    used: number;
    cap: number;
    credits: number;
  }
> = {
  player: { current: "player", renews: "Feb 1", used: 1.8, cap: 3, credits: 2 },
  team: {
    current: "program-lite",
    renews: "Jun 30",
    used: 14.5,
    cap: 25,
    credits: 0,
  },
};

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

const BTN_PRIMARY = advButton("primary", "sm");
const BTN_SECONDARY = advButton("outline", "sm");

export function PlansPreview() {
  const [kind, setKind] = useState<Kind>("player");
  const [out, setOut] = useState(false);
  const [billing, setBilling] = useState<Billing>("monthly");

  const state = STATE[kind];
  const used = kind === "player" && out ? state.cap : state.used;
  const plans = PLANS[kind];
  const currentIndex = Math.max(
    0,
    plans.findIndex((p) => p.id === state.current),
  );
  const current = plans[currentIndex];
  const next = plans[currentIndex + 1];

  return (
    <main className="min-h-screen bg-[var(--surface-card)]">
      <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-page)] px-8 py-3">
        <div className="mx-auto flex max-w-[968px] flex-wrap items-center gap-3">
          <span className="text-[12px] text-[var(--ink-600)]">
            Design preview of Settings › Plan from January 2027. Fixed numbers,
            nothing is charged.
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Segmented
              value={kind}
              onChange={setKind}
              options={[
                { v: "player", t: "Personal workspace" },
                { v: "team", t: "Team workspace" },
              ]}
            />
            {kind === "player" && (
              <Segmented
                value={out ? "out" : "left"}
                onChange={(v) => setOut(v === "out")}
                options={[
                  { v: "left", t: "Hours left" },
                  { v: "out", t: "Out of hours" },
                ]}
              />
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1032px] flex-col gap-10 px-6 py-8 sm:px-8 sm:py-10">
        <header className="flex flex-col gap-3">
          <p className="eyebrow">Settings</p>
          <h1 className="text-display">Plan</h1>
          <p className="text-body-sm max-w-[520px]">
            What you pay and how much match video it covers.
          </p>
        </header>

        <div className="flex max-w-[640px] flex-col gap-5">
          {/* What you're on: the same facts strip the live page uses. */}
          <SettingsCard className="overflow-hidden p-0">
            <dl className="grid divide-y divide-[var(--border-hairline)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {[
                { label: "Plan", value: current.name },
                {
                  label: "Price",
                  value: `${usd(kind === "team" ? current.yearly : current.monthly)}${kind === "team" ? " / season" : " / mo"}`,
                },
                {
                  label: kind === "team" ? "Season ends" : "Renews",
                  value: state.renews,
                },
              ].map((f) => (
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

          {/* This month's hours, with the way to get more right beside them. */}
          <SettingsCard>
            <SettingsCardTitle
              className="pb-3"
              trailing={
                <span className="tabular text-[12px] text-[var(--ink-500)]">
                  Resets {kind === "team" ? "Feb 1" : state.renews}
                </span>
              }
            >
              Video this month
            </SettingsCardTitle>
            <div className="flex items-baseline gap-2">
              <span className="tabular text-title-lg leading-none">{used}</span>
              <span className="text-[12px] text-[var(--ink-500)]">
                of {state.cap} hours used
              </span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-subtle)]">
              <div
                className={cn(
                  "h-full rounded-full",
                  used >= state.cap
                    ? "bg-[var(--viz-amber)]"
                    : "bg-[var(--blue)]",
                )}
                style={{ width: `${Math.min(100, (used / state.cap) * 100)}%` }}
              />
            </div>
            <div className="mt-4 flex items-center gap-3 border-t border-[var(--border-hairline)] pt-3.5">
              <span className="min-w-0 flex-1 text-[12px] text-[var(--ink-900)]">
                {state.credits > 0
                  ? `${state.credits} hours in credits`
                  : "No credits"}
                <span className="mt-0.5 block text-[11px] text-[var(--ink-500)]">
                  Used after your plan hours run out. Credits last 12 months.
                </span>
              </span>
              <a href="#credits" className={BTN_SECONDARY}>
                Buy credits
              </a>
            </div>
          </SettingsCard>

          {kind === "player" && out && next && (
            <div className="flex flex-col gap-3 rounded-[14px] border border-[var(--warning-border)] bg-[var(--warning-bg)] px-6 py-[18px] sm:flex-row sm:items-center">
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-[var(--ink-900)]">
                  You&apos;ve used this month&apos;s 3 hours.
                </span>
                <span className="mt-0.5 block text-[12px] leading-[1.5] text-[var(--ink-600)]">
                  Your 2 hours of credits are being used now. Or move to{" "}
                  {next.name} for {next.hours} at {usd(next.monthly)} a month.
                </span>
              </span>
              <button type="button" className={BTN_PRIMARY}>
                Upgrade to {next.name}
              </button>
            </div>
          )}

          {/* Change plan: one row per plan, the current one marked. */}
          <SettingsCard>
            <SettingsCardTitle
              className="pb-2"
              trailing={
                <Segmented
                  value={billing}
                  onChange={setBilling}
                  options={[
                    { v: "monthly", t: "Monthly" },
                    { v: "yearly", t: kind === "team" ? "Season" : "Yearly" },
                  ]}
                />
              }
            >
              Change plan
            </SettingsCardTitle>
            {plans.map((p, i) => {
              const isCurrent = p.id === state.current;
              const yearly = billing === "yearly" && p.monthly > 0;
              const price =
                p.monthly === 0
                  ? "Free"
                  : yearly
                    ? `${usd(p.yearly)} / ${p.yearlyUnit}`
                    : `${usd(p.monthly)} / mo`;
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-4 border-t border-[var(--border-hairline)] py-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[12px] text-[var(--ink-900)]">
                      {p.name}
                      {isCurrent && (
                        <span className="rounded-full bg-[var(--blue-tint-08)] px-2 py-0.5 text-[10px] font-medium text-[var(--blue-text)]">
                          Current
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-[1.5] text-[var(--ink-500)]">
                      {p.hours} · {p.note}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-[13px] text-[var(--ink-900)]">
                    {price}
                  </span>
                  <span className="w-[92px] shrink-0 text-right">
                    {isCurrent ? (
                      <span className="text-[11px] text-[var(--ink-500)]">
                        Your plan
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={
                          i > currentIndex ? BTN_PRIMARY : BTN_SECONDARY
                        }
                      >
                        {i > currentIndex ? "Upgrade" : "Switch"}
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
            <span className="mt-1 border-t border-[var(--border-hairline)] pt-3.5 text-[11px] leading-[1.5] text-[var(--ink-500)]">
              {kind === "team"
                ? "A season is 6 months and saves over 15%. Fall pilot programs get 15% off their first paid season."
                : "Yearly is 10 months' price for 12. Changes start on your next billing date."}
            </span>
          </SettingsCard>

          <div id="credits">
            <SettingsCard>
              <SettingsCardTitle className="pb-2">
                Credit packs
              </SettingsCardTitle>
              {CREDITS.map((c) => (
                <div
                  key={c.hours}
                  className="flex items-center gap-4 border-t border-[var(--border-hairline)] py-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] text-[var(--ink-900)]">
                      {c.hours}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-[var(--ink-500)]">
                      {c.note}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-[13px] text-[var(--ink-900)]">
                    {usd(c.price)}
                  </span>
                  <span className="w-[92px] shrink-0 text-right">
                    <button type="button" className={BTN_SECONDARY}>
                      Buy
                    </button>
                  </span>
                </div>
              ))}
            </SettingsCard>
          </div>
        </div>
      </div>
    </main>
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
