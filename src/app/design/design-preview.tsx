"use client";

import { useState } from "react";
import {
  BetaWelcomeDialog,
  type BetaWelcomeTerms,
} from "@/components/dashboard/beta-welcome-dialog";
import { advButton } from "@/lib/ui/adv-button";
import { NightCourtDialog, ScoreboardDialog, SplitDialog } from "./directions";

const VARIANTS: readonly {
  id: string;
  label: string;
  terms: BetaWelcomeTerms;
}[] = [
  { id: "player", label: "Player", terms: { hours: 2 } },
  {
    id: "program",
    label: "College program",
    terms: { hours: 75, programName: "Northfield University" },
  },
];

const DIRECTIONS = [
  { id: "a", label: "A · Brand band", Dialog: BetaWelcomeDialog },
  { id: "b", label: "B · Night court", Dialog: NightCourtDialog },
  { id: "c", label: "C · Split", Dialog: SplitDialog },
  { id: "d", label: "D · Scoreboard", Dialog: ScoreboardDialog },
] as const;

/** The beta welcome dialog, open, in every direction and variant. */
export function DesignPreview() {
  const [variant, setVariant] = useState(VARIANTS[0]);
  const [direction, setDirection] = useState<(typeof DIRECTIONS)[number]>(
    DIRECTIONS[0],
  );
  const [open, setOpen] = useState(true);
  const { Dialog } = direction;

  return (
    <main className="min-h-screen bg-[var(--surface-page)] px-14 py-10">
      <h1 className="text-[20px] font-medium text-[var(--ink-900)]">
        Beta welcome dialog
      </h1>
      <p className="mt-1 max-w-[60ch] text-[12px] leading-[1.6] text-[var(--ink-600)]">
        Shown once per browser on the first dashboard visit. A is what ships
        today; pick a direction and a variant to open it.
      </p>
      <div className="mt-5 flex flex-wrap gap-2.5">
        {DIRECTIONS.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => {
              setDirection(d);
              setOpen(true);
            }}
            className={advButton(
              d.id === direction.id ? "primary" : "outline",
              "sm",
            )}
          >
            {d.label}
          </button>
        ))}
      </div>
      <div className="mt-2.5 flex gap-2.5">
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
      <Dialog open={open} onOpenChange={setOpen} terms={variant.terms} />
    </main>
  );
}
