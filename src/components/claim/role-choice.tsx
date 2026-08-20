"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User, Users, Shield } from "lucide-react";
import { CLAIM_BUTTON, ClaimActions, CLAIM_MICRO } from "./claim-shell";
import { cn } from "@/lib/utils";

type Choice = "play" | "coach" | "junior";

/**
 * Three cards across, not three rows down.
 *
 * At page scale the answers are siblings and should be read as a set — a
 * stacked list makes the first one look like the recommendation. Each card
 * carries an icon, the answer, and what it gets you, which is all a person
 * needs to pick without reading twice.
 *
 * The wording is Onboarding 0.2's, verbatim: one question vocabulary
 * product-wide, so the same three answers mean the same three things wherever
 * they are asked.
 */
const OPTIONS: {
  id: Choice;
  icon: typeof User;
  label: string;
  sub: string;
}[] = [
  {
    id: "play",
    icon: User,
    label: "I play",
    sub: "My own matches, my own numbers.",
  },
  {
    id: "coach",
    icon: Users,
    label: "I coach",
    sub: "A roster of players, one shared budget.",
  },
  {
    id: "junior",
    icon: Shield,
    label: "I manage a junior's account",
    sub: "Parent or academy staff.",
  },
];

/**
 * Where each answer goes.
 *
 * "I coach" skips the player branch and goes straight to F3 program setup, and
 * "I manage a junior's account" leaves for the standard signup rather than
 * being walked through a collegiate path that does not apply — no
 * collegiate-flavoured dead end.
 *
 * "I play" is the one answer routed against the design's note, which sends it
 * out to Onboarding 0.3 along with the parent. 0.3 is where the invited-player
 * branch lives and it does not exist yet, so leaving here would send a player
 * on a program to consumer signup and orphan the request-an-invite path
 * entirely. `intent=join` keeps them on the search but off the "Set up this
 * program" action, which is the one thing a player must never be routed at.
 * Point this at 0.3 when 0.3 ships.
 */
const DESTINATION: Record<Choice, string> = {
  play: "/claim/program?intent=join",
  coach: "/claim/program",
  junior: "/sign-up",
};

export function RoleChoice() {
  const router = useRouter();
  const [choice, setChoice] = useState<Choice | null>(null);

  return (
    <div className="flex flex-col gap-7">
      <div
        role="radiogroup"
        aria-label="How do you use Advantage?"
        className="grid gap-3 sm:grid-cols-3"
      >
        {OPTIONS.map((option) => {
          const selected = choice === option.id;
          const Icon = option.icon;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setChoice(option.id)}
              className={cn(
                "flex cursor-pointer flex-col gap-2 rounded-[var(--radius-element)] border p-5 text-left transition-colors duration-[var(--duration-fast)]",
                "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
                selected
                  ? "border-[var(--blue)] bg-[var(--blue-soft)]"
                  : "border-[var(--border-field)] bg-[var(--surface-card)] hover:bg-[var(--surface-subtle)]"
              )}
            >
              <Icon
                className={cn(
                  "size-5",
                  selected ? "text-[var(--blue)]" : "text-[var(--ink-600)]"
                )}
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <span className="text-[14px] text-[var(--ink-900)]">
                {option.label}
              </span>
              <span className="text-body-sm">{option.sub}</span>
            </button>
          );
        })}
      </div>

      <ClaimActions gap={16}>
        <button
          type="button"
          disabled={!choice}
          onClick={() => choice && router.push(DESTINATION[choice])}
          className={CLAIM_BUTTON}
        >
          Continue
        </button>
        <span className={CLAIM_MICRO}>
          Coaches take a different second step.
        </span>
      </ClaimActions>
    </div>
  );
}
