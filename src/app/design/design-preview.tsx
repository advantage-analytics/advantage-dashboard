"use client";

import { useState } from "react";
import {
  BetaWelcomeDialog,
  type BetaWelcomeTerms,
} from "@/components/dashboard/beta-welcome-dialog";
import { advButton } from "@/lib/ui/adv-button";
import { HeaderPreview } from "./header-preview";

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
    terms: { hours: 75, programName: "Northfield University" },
    usedHours: 31,
  },
];

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
        Beta welcome dialog
      </h1>
      <p className="mt-1 max-w-[60ch] text-[12px] leading-[1.6] text-[var(--ink-600)]">
        Shown once per browser on the first dashboard visit. Pick a variant to
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
        The Beta pill leads the header&apos;s controls with this month&apos;s
        video hours left. Click it to reopen the dialog.
      </p>
      <div className="mt-5 max-w-[960px]">
        <div className="flex flex-col gap-4">
          <HeaderPreview
            hours={{
              remainingSeconds:
                (variant.terms.hours - variant.usedHours) * 3600,
              capSeconds: variant.terms.hours * 3600,
              bandFull: false,
            }}
            onOpenBeta={() => setOpen(true)}
          />
          {/* An individual whose own hours are untouched, after the shared
              open-beta ceiling has run out for the month. */}
          {!variant.terms.programName && (
            <HeaderPreview
              hours={{
                remainingSeconds: 0,
                capSeconds: variant.terms.hours * 3600,
                bandFull: true,
              }}
              onOpenBeta={() => setOpen(true)}
            />
          )}
        </div>
      </div>

      <BetaWelcomeDialog
        open={open}
        onOpenChange={setOpen}
        terms={variant.terms}
      />
    </main>
  );
}
