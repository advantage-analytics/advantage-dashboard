"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CLAIM_BUTTON, ClaimActions, RadioDot } from "./claim-shell";
import { cn } from "@/lib/utils";
import type { CustomOrgType } from "@/lib/services/programs/create-actions";

/**
 * Onboarding & Team Setup, screen 7.1 — what kind of organization. A radio, not
 * a fork: the type only sets copy ("club" vs "program"), never the machinery.
 * There is deliberately no D-I/D-III distinction and no dataset lookup — an
 * "other" org isn't in any list we hold, so asking it to find itself would
 * strand everyone.
 *
 * The four values are the CHECK-constrained set `create_custom_program` accepts
 * (club | high_school | academy | other); the label/sub copy is 7.1's, verbatim.
 * Continue carries the choice to the setup screen as a query param.
 */

const OPTIONS: { id: CustomOrgType; label: string; sub: string }[] = [
  {
    id: "club",
    label: "Tennis club",
    sub: "A private or community club team.",
  },
  {
    id: "high_school",
    label: "High school",
    sub: "Varsity or JV program.",
  },
  {
    id: "academy",
    label: "Academy",
    sub: "A coaching academy or training group.",
  },
  {
    id: "other",
    label: "Something else",
    sub: "Any other group with a shared roster.",
  },
];


export function TeamTypeChoice() {
  const router = useRouter();
  const [type, setType] = useState<CustomOrgType | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <div
        role="radiogroup"
        aria-label="What kind of organization?"
        className="flex flex-col gap-2.5"
      >
        {OPTIONS.map((option) => {
          const selected = type === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setType(option.id)}
              className={cn(
                "flex cursor-pointer items-start gap-3.5 rounded-[var(--radius-element)] border px-[18px] py-4 text-left transition-colors duration-[var(--duration-fast)]",
                "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
                selected
                  ? "border-[var(--blue)] bg-[var(--blue-tint-08)]"
                  : "border-[var(--border-field)] bg-[var(--surface-card)] hover:bg-[var(--surface-subtle)]"
              )}
            >
              <RadioDot selected={selected} />
              <span className="flex min-w-0 flex-col gap-[3px]">
                <span className="text-[14px] text-[var(--ink-900)]">
                  {option.label}
                </span>
                <span className="text-body-sm">{option.sub}</span>
              </span>
            </button>
          );
        })}
      </div>

      <ClaimActions>
        <button
          type="button"
          disabled={!type}
          onClick={() =>
            type && router.push(`/claim/team/setup?type=${type}`)
          }
          className={CLAIM_BUTTON}
        >
          Continue
        </button>
      </ClaimActions>
    </div>
  );
}
