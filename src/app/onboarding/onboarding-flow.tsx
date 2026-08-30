"use client";

import { useState, useTransition } from "react";
import { Check, Shield, User, Users } from "lucide-react";
import {
  ClaimActions,
  ClaimHeading,
  CLAIM_BUTTON,
  CLAIM_LINK,
  CLAIM_MICRO,
} from "@/components/claim/claim-shell";
import { cn } from "@/lib/utils";
import { finishOnboarding, type OnboardingChoice } from "./actions";

/**
 * The two-question first run — Onboarding & Team Setup, Stage 1, screens 1.2
 * and 1.3. Full-screen panes with no dashboard chrome and, unlike the claim
 * flow's shell, no escape chrome either: there is no account-intact "leave
 * setup" here, because the account is already made and these two answers are
 * the setup. The one soft exit the design gives is step 2's Skip.
 *
 * Step 1 reuses the claim flow's persona cards verbatim — one question
 * vocabulary product-wide (`claim/role-choice.tsx` carries the same copy).
 * The difference is what happens after: here the answer persists to
 * `users.role` and stamps `onboarded_at`, where /claim's copy only routes.
 */

type Persona = "play" | "coach" | "junior";
type CollegeAnswer = "yes" | "no" | "not_yet";

const PERSONAS: {
  id: Persona;
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

/** Screen 1.3's three answers, verbatim. */
const COLLEGE_OPTIONS: { id: CollegeAnswer; label: string; sub: string }[] = [
  {
    id: "yes",
    label: "Yes — I'm on a college roster",
    sub: "We'll help you find your program and ask your coach for access.",
  },
  {
    id: "no",
    label: "No — I play club, tournaments or juniors",
    sub: "Your own account, your own analysis budget.",
  },
  {
    id: "not_yet",
    label: "Not yet — I'm being recruited",
    sub: "Start on your own account; add a college team whenever you commit.",
  },
];

/**
 * The design system's check-dot `Radio`: solid Signal Blue with a white check
 * when chosen, a 1px ink-300 ring otherwise. The dot marks the selected item —
 * it never appears on hover.
 */
function RadioDot({ selected }: { selected: boolean }) {
  return selected ? (
    <span
      className="mt-[1px] flex size-3.5 shrink-0 items-center justify-center rounded-full bg-[var(--blue)]"
      aria-hidden="true"
    >
      <Check className="size-[9px] text-white" strokeWidth={2.5} />
    </span>
  ) : (
    <span
      className="mt-[1px] size-3.5 shrink-0 rounded-full border border-[var(--ink-300)]"
      aria-hidden="true"
    />
  );
}

export function OnboardingFlow() {
  const [step, setStep] = useState<1 | 2>(1);
  const [persona, setPersona] = useState<Persona | null>(null);
  const [college, setCollege] = useState<CollegeAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (choice: OnboardingChoice) => {
    setError(null);
    startTransition(async () => {
      // Success redirects on the server; reaching the line below means the
      // write failed and there is a sentence to show.
      const result = await finishOnboarding(choice);
      if (result && !result.ok) setError(result.error);
    });
  };

  const continueFromStep1 = () => {
    if (!persona) return;
    if (persona === "play") {
      setError(null);
      setStep(2);
      return;
    }
    submit(persona === "coach" ? "coach" : "junior");
  };

  const continueFromStep2 = () => {
    if (!college) return;
    submit(college === "yes" ? "college" : "solo");
  };

  return (
    <div className="flex min-h-screen items-center bg-[var(--surface-card)] px-6 py-24 sm:px-10">
      <div
        className="mx-auto w-full"
        style={{ maxWidth: step === 1 ? 840 : 560 }}
      >
        <div className="flex min-w-0 flex-col" style={{ gap: 28 }}>
          {step === 1 ? (
            <>
              <ClaimHeading
                gap={8}
                step="Step 1 of 2"
                title="How do you use Advantage?"
                body="This sets what your dashboard opens on. You can change it in settings."
                bodyMax="60ch"
              />
              <div
                role="radiogroup"
                aria-label="How do you use Advantage?"
                className="grid gap-3 sm:grid-cols-3"
              >
                {PERSONAS.map((option) => {
                  const selected = persona === option.id;
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setPersona(option.id)}
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
                          selected
                            ? "text-[var(--blue)]"
                            : "text-[var(--ink-600)]"
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
                  disabled={!persona || isPending}
                  onClick={continueFromStep1}
                  className={CLAIM_BUTTON}
                >
                  Continue
                </button>
                <span className={CLAIM_MICRO}>
                  Coaches take a different second step.
                </span>
              </ClaimActions>
            </>
          ) : (
            <>
              <ClaimHeading
                gap={8}
                step="Step 2 of 2"
                title="Do you play for a college program?"
                body="This decides where your first matches go — and whether your coach is part of it."
                bodyMax="52ch"
              />
              <div
                role="radiogroup"
                aria-label="Do you play for a college program?"
                className="flex flex-col gap-2.5"
              >
                {COLLEGE_OPTIONS.map((option) => {
                  const selected = college === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setCollege(option.id)}
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
              <ClaimActions gap={16}>
                <button
                  type="button"
                  disabled={!college || isPending}
                  onClick={continueFromStep2}
                  className={CLAIM_BUTTON}
                >
                  Continue
                </button>
                {/* Skip finishes as an individual player — the persona from
                    step 1 still counts, only this question goes unanswered. */}
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => submit("solo")}
                  className={CLAIM_LINK}
                >
                  Skip
                </button>
              </ClaimActions>
            </>
          )}

          {error && (
            <p role="alert" className="text-[12px] text-[var(--danger)]">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
