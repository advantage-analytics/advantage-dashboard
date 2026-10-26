"use client";

import { BetaMeterPill } from "@/components/dashboard/beta-header-meter";
import { FooterMeter } from "@/components/dashboard/matches/new-match-wizard/FooterMeter";
import { HeaderPreview } from "./header-preview";

/**
 * The header pill and the wizard footer for a player who holds hours BEYOND
 * the free allowance while free hours remain — the state that confused a real
 * player (2h free untouched + 4h an admin added: every headline said "2h",
 * the 4h lived in small print as "credits"). The figure is now the total, the
 * split follows, and granted hours are "added", never "credits".
 *
 * Real components with fixed figures. Hover a pill for its tooltip.
 */

const HOUR = 3600;
const UNTIL = "2027-10-23T15:04:08Z";

interface Case {
  label: string;
  hours: {
    remainingSeconds: number;
    capSeconds: number;
    creditSeconds: number;
    grantedSeconds: number;
    nextCreditExpiresAt: string;
  };
  creditWord: "added" | "credits";
}

const CASES: readonly Case[] = [
  {
    label: "Given 4h by an admin, free hours untouched",
    hours: {
      remainingSeconds: 2 * HOUR,
      capSeconds: 2 * HOUR,
      creditSeconds: 4 * HOUR,
      grantedSeconds: 4 * HOUR,
      nextCreditExpiresAt: UNTIL,
    },
    creditWord: "added",
  },
  {
    label: "Given 4h, half an hour of free time spent",
    hours: {
      remainingSeconds: 1.5 * HOUR,
      capSeconds: 2 * HOUR,
      creditSeconds: 4 * HOUR,
      grantedSeconds: 4 * HOUR,
      nextCreditExpiresAt: UNTIL,
    },
    creditWord: "added",
  },
  {
    label: "Bought a 4h pack, free hours untouched",
    hours: {
      remainingSeconds: 2 * HOUR,
      capSeconds: 2 * HOUR,
      creditSeconds: 4 * HOUR,
      grantedSeconds: 0,
      nextCreditExpiresAt: UNTIL,
    },
    creditWord: "credits",
  },
];

export function HoursCopyPreview() {
  return (
    <section id="hours-copy" className="mt-16 max-w-[960px]">
      <h2 className="text-[14px] font-medium text-[var(--ink-900)]">
        Free hours with added hours or credits behind them
      </h2>
      <p className="mt-1 max-w-[70ch] text-[12px] leading-[1.6] text-[var(--ink-600)]">
        The pill&apos;s figure is the total; its tooltip says the split and when
        each part ends. Hours an admin added are &ldquo;added&rdquo;; hours
        bought as a pack are &ldquo;credits&rdquo;. The wizard footer says the
        same split while no video is priced.
      </p>
      <div className="mt-5 flex flex-col gap-6">
        {CASES.map((c) => (
          <div key={c.label} className="flex flex-col gap-2">
            <span className="text-[11px] text-[var(--ink-500)]">{c.label}</span>
            <HeaderPreview
              tier="beta"
              hours={c.hours}
              resetsOn="Nov 1"
              onOpenBeta={() => {}}
            />
            <div className="flex h-12 items-center rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-white px-5">
              <span className="text-[12px] text-[var(--ink-600)]">Cancel</span>
              <FooterMeter
                remainingSeconds={c.hours.remainingSeconds}
                capSeconds={c.hours.capSeconds}
                creditSeconds={c.hours.creditSeconds}
                creditWord={c.creditWord}
                suffix="resets on the 1st"
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// Keeps the pill's prop type in view for the cases above.
export type PillHoursForPreview = React.ComponentProps<
  typeof BetaMeterPill
>["hours"];
