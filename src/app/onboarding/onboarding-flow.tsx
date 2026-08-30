"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Shield, User, Users } from "lucide-react";
import AuthCheckbox from "@/components/auth/auth-checkbox";
import {
  ClaimActions,
  ClaimHeading,
  CLAIM_BUTTON,
  CLAIM_FIELD,
  CLAIM_LABEL,
  CLAIM_LINK,
  CLAIM_MICRO,
} from "@/components/claim/claim-shell";
import { cn } from "@/lib/utils";
import {
  finishGuardianOnboarding,
  finishOnboarding,
  type OnboardingChoice,
} from "./actions";
import { guardianClassYears } from "./guardian-options";

/**
 * The first run — Onboarding & Team Setup screens 1.2 and 1.3, plus the
 * guardian branch's 3.1. Full-screen panes with no dashboard chrome and,
 * unlike the claim flow's shell, no escape chrome either: there is no
 * account-intact "leave setup" here, because the account is already made and
 * these answers are the setup. The one soft exit the design gives is the
 * college question's Skip; the guardian step has none, because consent is the
 * one answer that can't be deferred.
 *
 * Step 1 reuses the claim flow's persona cards verbatim — one question
 * vocabulary product-wide (`claim/role-choice.tsx` carries the same copy).
 * The difference is what happens after: here the answer persists to
 * `users.role` and stamps `onboarded_at`, where /claim's copy only routes.
 *
 * The junior persona is the exception to "the answer persists": picking it
 * writes nothing and only turns the page to 3.1. Everything — role, the
 * player's details, consent, the stamp — lands together on the guardian
 * screen's Continue, so bailing there leaves the account un-onboarded and the
 * gate intact. See `finishGuardianOnboarding` in `actions.ts`.
 */

type Persona = "play" | "coach" | "junior";
type CollegeAnswer = "yes" | "no" | "not_yet";

/** 1 = persona (1.2) · 2 = college question (1.3) · 3 = guardian step (3.1) */
type Step = 1 | 2 | 3;

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
 * Screen 3.1's three under-18 acknowledgment rows, verbatim. Everything the
 * linked guardian terms formalize is stated here, so the checkbox below them
 * is informed consent even if no one clicks the link — which is why these are
 * rows on the screen and not a wall of terms behind it.
 */
const GUARDIAN_ACKNOWLEDGMENTS: readonly string[] = [
  "You're their parent or legal guardian, and you consent to Advantage analyzing match video of them.",
  "You'll manage what's uploaded and who it's shared with until you transfer the account.",
  "Video of a minor is never used to train models or shown outside the people you share it with.",
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
  const [step, setStep] = useState<Step>(1);
  const [persona, setPersona] = useState<Persona | null>(null);
  const [college, setCollege] = useState<CollegeAnswer | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [classYear, setClassYear] = useState("");
  const [consent, setConsent] = useState(false);
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
    setError(null);
    // Both branches only turn a page: "play" to the college question, "junior"
    // to the guardian step. Nothing is written until the branch's own submit,
    // so a guardian who bails on 3.1 is still gated into onboarding next time.
    if (persona === "play") {
      setStep(2);
      return;
    }
    if (persona === "junior") {
      setStep(3);
      return;
    }
    submit("coach");
  };

  const continueFromStep2 = () => {
    if (!college) return;
    submit(college === "yes" ? "college" : "solo");
  };

  // The checkbox gates Continue, and so do the two fields the row above it
  // names — the server refuses all three anyway; this just keeps the button
  // honest about what a tap will do.
  const guardianReady =
    playerName.trim().length > 0 && classYear !== "" && consent;

  const submitGuardian = () => {
    if (!guardianReady) return;
    setError(null);
    startTransition(async () => {
      const result = await finishGuardianOnboarding({
        playerName,
        classYear,
        consent,
      });
      if (result && !result.ok) setError(result.error);
    });
  };

  // 3.1's consent sentence names the player ("I'm Sofia's parent or legal
  // guardian…"), so the label follows the name field as it's typed.
  const playerFirstName = playerName.trim().split(/\s+/)[0] ?? "";
  const playerPossessive = playerFirstName
    ? `${playerFirstName}'s`
    : "the player's";

  return (
    <div className="flex min-h-screen items-center bg-[var(--surface-card)] px-6 py-24 sm:px-10">
      <div
        className="mx-auto w-full"
        style={{ maxWidth: step === 1 ? 840 : step === 2 ? 560 : 584 }}
      >
        <div
          className="flex min-w-0 flex-col"
          style={{ gap: step === 3 ? 20 : 28 }}
        >
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
          ) : step === 2 ? (
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
          ) : (
            <>
              {/* Screen 3.1 — the guardian acknowledgment. Unlike 1.2/1.3
                  there is no step eyebrow and the title is `text-title`, not
                  `text-title-lg`: the design draws this as the smaller pane
                  where the account holder stops being the subject. */}
              <div className="flex flex-col" style={{ gap: 6 }}>
                <h1 className="text-title">Who&apos;s playing?</h1>
                <p className="text-body-sm" style={{ maxWidth: "56ch" }}>
                  Everything in Advantage will be about this player. You hold
                  the account and can hand it to them later.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr]">
                <div>
                  <label htmlFor="guardian-player-name" className={CLAIM_LABEL}>
                    Player&apos;s name
                  </label>
                  <input
                    id="guardian-player-name"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    // Off, deliberately: the browser's saved identity is the
                    // adult holding the account, and the one name this field
                    // must not autofill is theirs.
                    autoComplete="off"
                    className={CLAIM_FIELD}
                  />
                </div>
                <div>
                  <label htmlFor="guardian-class-year" className={CLAIM_LABEL}>
                    Graduating class
                  </label>
                  <select
                    id="guardian-class-year"
                    value={classYear}
                    onChange={(e) => setClassYear(e.target.value)}
                    className={cn(
                      CLAIM_FIELD,
                      "cursor-pointer",
                      classYear === "" && "text-[var(--ink-400)]"
                    )}
                  >
                    <option value="" disabled>
                      Select year
                    </option>
                    {guardianClassYears().map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-[var(--radius-element)] border border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-[18px] py-4">
                <span className="eyebrow">If the player is under 18</span>
                {/* The design's honest rows: a 2px tick-bar, not a checkmark —
                    these are facts being acknowledged, not features. */}
                <div className="flex flex-col">
                  {GUARDIAN_ACKNOWLEDGMENTS.map((row, index) => (
                    <div
                      key={row}
                      className={cn(
                        "flex gap-2.5",
                        index === 0
                          ? "pb-[9px]"
                          : "border-t border-[var(--border-hairline)] py-[9px]",
                        index === GUARDIAN_ACKNOWLEDGMENTS.length - 1 && "pb-0"
                      )}
                    >
                      <span
                        className="mt-1 h-3 w-[2px] shrink-0 bg-[var(--ink-300)]"
                        aria-hidden="true"
                      />
                      <span className="text-body-sm">{row}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-start gap-2.5 border-t border-[var(--border-hairline)] pt-3">
                  {/* AuthCheckbox is label-less by design: wrapping the copy
                      in the control's own <label> would make the terms link
                      toggle the box on the way out. Sibling text, bound with
                      aria-describedby — same shape as the sign-up consent. */}
                  <AuthCheckbox
                    id="guardian-consent"
                    checked={consent}
                    onChange={setConsent}
                    aria-label={`I'm ${playerPossessive} parent or legal guardian and I agree to the above`}
                    aria-describedby="guardian-consent-copy"
                  />
                  <span
                    id="guardian-consent-copy"
                    className="text-body-sm"
                    style={{ color: "var(--ink-900)", maxWidth: "52ch" }}
                  >
                    I&apos;m {playerPossessive} parent or legal guardian and I
                    agree to the above.{" "}
                    {/* The same terms target the sign-up consent line uses —
                        no guardian-specific terms page exists yet, and two
                        legal destinations would be one more than the product
                        has documents for. */}
                    <Link
                      href="/legal/terms-and-conditions"
                      className="rounded-sm text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                    >
                      Read the guardian terms
                    </Link>
                    .
                  </span>
                </div>
              </div>

              {/* Alone in its row — 3.1 gives Continue no companion line and
                  no Skip: consent has no soft exit. */}
              <div>
                <button
                  type="button"
                  disabled={!guardianReady || isPending}
                  onClick={submitGuardian}
                  className={CLAIM_BUTTON}
                >
                  Continue
                </button>
              </div>
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
