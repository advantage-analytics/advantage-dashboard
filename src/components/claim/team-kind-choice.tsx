"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, GraduationCap } from "lucide-react";
import { CLAIM_BUTTON, ClaimActions, RadioDot } from "./claim-shell";
import { cn } from "@/lib/utils";

/**
 * Onboarding & Team Setup, screen 5.1 — the fork. The one new junction: a
 * college program is claimed and announced; anything else is a workspace the
 * creator simply owns. Phrased by what each path asks of the coach, not by org
 * type in the abstract.
 *
 * Two cards, not two rows: the answers are siblings, and a stacked list makes
 * the first look like the recommendation. Card copy is 5.1's, verbatim — except
 * the "other" card's budget line. The design footnotes both cards "75h shared",
 * but `quotaTierFor()` (services/splitstep/quota.ts) draws the INDIVIDUAL figure
 * for a self-serve custom org, not the collegiate 75h — the quota file's own
 * comment records that this supersedes the Stage 7 "same 75h" line. So only the
 * college card carries the shared-budget note; asserting it on the other card
 * would be a promise the code does not keep.
 */

type Kind = "college" | "other";

const OPTIONS: {
  id: Kind;
  icon: typeof GraduationCap;
  title: string;
  sub: string;
  /** The bordered footer note. Null where there is nothing true to say. */
  foot: string | null;
  destination: string;
}[] = [
  {
    id: "college",
    icon: GraduationCap,
    title: "A college program",
    sub: "You'll claim it from the list; recorded staff confirm it.",
    foot: "NCAA · NAIA · NJCAA · 75h shared",
    destination: "/claim/program",
  },
  {
    id: "other",
    icon: Building2,
    title: "A club, high school or academy",
    sub: "You name it and it's yours — nothing to confirm.",
    foot: "Clubs · schools · academies",
    destination: "/claim/team/type",
  },
];


export function TeamKindChoice() {
  const router = useRouter();
  const [kind, setKind] = useState<Kind | null>(null);

  return (
    <div className="flex flex-col gap-7">
      <div
        role="radiogroup"
        aria-label="What kind of team is this?"
        className="grid gap-4 sm:grid-cols-2"
      >
        {OPTIONS.map((option) => {
          const selected = kind === option.id;
          const Icon = option.icon;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setKind(option.id)}
              className={cn(
                "flex cursor-pointer flex-col gap-3.5 rounded-[var(--radius-card)] border p-6 text-left transition-colors duration-[var(--duration-fast)]",
                "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
                selected
                  ? "border-[var(--blue)] bg-[var(--blue-tint-08)]"
                  : "border-[var(--border-field)] bg-[var(--surface-card)] hover:bg-[var(--surface-subtle)]"
              )}
            >
              <div className="flex items-center justify-between">
                <Icon
                  className={cn(
                    "size-[22px]",
                    selected ? "text-[var(--blue)]" : "text-[var(--ink-700)]"
                  )}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <RadioDot selected={selected} align="" />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[16px] text-[var(--ink-900)]">
                  {option.title}
                </span>
                <span className="text-body-sm max-w-[32ch]">{option.sub}</span>
              </div>
              {option.foot && (
                <span className="text-micro mt-1 border-t border-[var(--border-hairline)] pt-3">
                  {option.foot}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <ClaimActions>
        <button
          type="button"
          disabled={!kind}
          onClick={() =>
            kind &&
            router.push(OPTIONS.find((o) => o.id === kind)!.destination)
          }
          className={CLAIM_BUTTON}
        >
          Continue
        </button>
      </ClaimActions>
    </div>
  );
}
