"use client";

import { useState } from "react";
import {
  BetaWelcomeDialog,
  type BetaWelcomeTerms,
} from "@/components/dashboard/beta-welcome-dialog";
import { advButton } from "@/lib/ui/adv-button";
import { HeaderPreview } from "./header-preview";
import { AnalysisStepsPreview } from "./analysis-steps-preview";
import { ScoreboardPreview } from "./scoreboard-preview";
import { TourPreview } from "./tour-preview";

const VARIANTS: readonly {
  id: string;
  label: string;
  terms: BetaWelcomeTerms;
  /** Hours already spent this month, for the header pill. */
  usedHours: number;
}[] = [
  { id: "player", label: "Player", terms: { hours: 2 }, usedHours: 0.5 },
  {
    id: "program",
    label: "College program",
    terms: {
      hours: 75,
      programName: "Northfield University",
      tier: "pilot",
    },
    usedHours: 31,
  },
  {
    id: "club",
    label: "Club team",
    terms: { hours: 2, tier: "pilot" },
    usedHours: 0.5,
  },
];

/**
 * Every state the header pill can be in for a variant: the skeleton while the
 * first read is in flight, the figure, out of hours (a program's own, or an
 * individual's shared open-beta band), and a failed read's bare tag.
 */
function pillStates(variant: (typeof VARIANTS)[number]): {
  label: string;
  hours: React.ComponentProps<typeof HeaderPreview>["hours"];
}[] {
  const cap = variant.terms.hours * 3600;
  return [
    { label: "Loading", hours: "loading" },
    {
      label: "Loaded",
      hours: {
        remainingSeconds: cap - variant.usedHours * 3600,
        capSeconds: cap,
        bandFull: false,
      },
    },
    {
      label: "Out of hours — own allowance spent",
      hours: { remainingSeconds: 0, capSeconds: cap, bandFull: false },
    },
    // An individual whose own hours are untouched, after the shared open-beta
    // ceiling has run out for the month.
    ...(variant.terms.tier === "pilot"
      ? []
      : [
          {
            label: "Out of hours — shared beta hours spent",
            hours: { remainingSeconds: 0, capSeconds: cap, bandFull: true },
          },
        ]),
    { label: "Read failed", hours: null },
  ];
}

/**
 * The beta welcome dialog, open, in each variant the dashboard can show, and
 * the header pill that reopens it.
 */
export function DesignPreview() {
  const [variant, setVariant] = useState(VARIANTS[0]);
  const [open, setOpen] = useState(true);

  return (
    <main className="min-h-screen bg-[var(--surface-page)] px-14 py-10">
      <h1 className="text-[16px] font-medium text-[var(--ink-900)]">
        Beta and pilot welcome dialog
      </h1>
      <p className="mt-1 max-w-[60ch] text-[12px] leading-[1.6] text-[var(--ink-600)]">
        Shown once per account on its first dashboard visit. Pick a variant to
        open it.
      </p>
      <div className="mt-5 flex gap-2.5">
        {VARIANTS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => {
              setVariant(v);
              setOpen(true);
            }}
            className={advButton(
              v.id === variant.id ? "primary" : "outline",
              "sm",
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

      <h2 className="mt-12 text-[14px] font-medium text-[var(--ink-900)]">
        Reopening it from the header
      </h2>
      <p className="mt-1 max-w-[60ch] text-[12px] leading-[1.6] text-[var(--ink-600)]">
        The Beta pill (Pilot for a team) leads the header&apos;s controls with
        this month&apos;s video hours left. Click it to reopen the dialog. Hover
        one for its tooltip.
      </p>
      <div className="mt-5 max-w-[960px]">
        <div className="flex flex-col gap-4">
          {pillStates(variant).map((state) => (
            <div key={state.label} className="flex flex-col gap-1.5">
              <span className="text-[11px] text-[var(--ink-500)]">
                {state.label}
              </span>
              <HeaderPreview
                tier={variant.terms.tier ?? "beta"}
                hours={state.hours}
                resetsOn="Oct 1"
                onOpenBeta={() => setOpen(true)}
              />
            </div>
          ))}
        </div>
      </div>

      <AnalysisStepsPreview />
      <ScoreboardPreview />
      <TourPreview />

      <BetaWelcomeDialog
        open={open}
        onOpenChange={setOpen}
        terms={variant.terms}
      />
    </main>
  );
}
