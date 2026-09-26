"use client";

import { useState, useTransition } from "react";
import posthog from "posthog-js";
import {
  FileSpreadsheet,
  Shield,
  Smartphone,
  User,
  Users,
  Video,
} from "lucide-react";
import AuthCheckbox from "@/components/auth/auth-checkbox";
import {
  CLAIM_BUTTON,
  CLAIM_FIELD,
  CLAIM_LABEL,
  CLAIM_LINK,
  CLAIM_MICRO,
  ClaimActions,
  ClaimHeading,
  ClaimSelect,
  RadioDot,
  TermMark,
} from "@/components/claim/claim-shell";
import {
  PERSON_NAME_MAX,
  titleCaseTypedName,
} from "@/lib/data/person-name-case";
import { GUARDIAN_TERMS_URL } from "@/lib/constants";
import { isPostHogConfigured } from "@/lib/posthog-client";
import { cn } from "@/lib/utils";
import {
  finishGuardianOnboarding,
  finishOnboarding,
  type OnboardingChoice,
} from "./actions";
import {
  ACQUISITION_DETAIL_MAX,
  ACQUISITION_SOURCES,
  RECORDING_SOURCES,
  type AcquisitionSource,
  type RecordingSource,
} from "./answers";
import { guardianClassYears } from "./guardian-options";

/**
 * The first run — Onboarding & Team Setup screens 1.2 through 1.5 and 1.7,
 * plus the guardian branch's 3.1 (1.6, level and UTR, is held until something
 * reads it, which is why the player's steps count to five). Full-screen panes with no dashboard chrome and,
 * unlike the claim flow's shell, no escape chrome either: there is no
 * account-intact "leave setup" here, because the account is already made and
 * these answers are the setup. The soft exits the design gives are the Skips
 * on 1.4, 1.5 and 1.7 — each stores null for its own question and nothing
 * else; the guardian step has none, because consent is the one answer that
 * can't be deferred.
 *
 * Step 1 (1.2) asks what to call the person. Both fields start empty even when
 * Google or Apple handed us a display name — the OAuth profile is often a
 * legal name, an initial or a school-issued string, and this name goes on
 * invites, the roster and every report a coach reads. Title case is applied on
 * blur by `titleCaseTypedName` and never enforced. Nothing is written here:
 * the name rides along in state and lands with whichever resolution finishes
 * the flow, so a bail after this step leaves the row exactly as it was.
 *
 * Step 2 (1.3) reuses the claim flow's persona cards verbatim — one question
 * vocabulary product-wide (`claim/role-choice.tsx` carries the same copy).
 * The difference is what happens after: here the answer persists to
 * `users.role` and stamps `onboarded_at`, where /claim's copy only routes.
 * A coach finishes right here; a player turns the page to 1.4.
 *
 * Steps 3, 5 and 6 (1.4, 1.5, 1.7) are the player's run. None of them writes
 * on its own: the college answer, the recording source and the acquisition
 * source ride along in state and land in one `finishOnboarding` call from
 * 1.7, together with the name and the stamp — so a player who bails anywhere
 * before that is still gated into onboarding next visit.
 *
 * The junior persona is the exception to "the answer persists": picking it
 * writes nothing and only turns the page to 3.1. Everything — the name, role,
 * the player's details, consent, the stamp — lands together on the guardian
 * screen's Continue, so bailing there leaves the account un-onboarded and the
 * gate intact. See `finishGuardianOnboarding` in `actions.ts`.
 */

type Persona = "play" | "coach" | "junior";
type CollegeAnswer = "yes" | "no" | "not_yet";

/**
 * 1 = name (1.2) · 2 = persona (1.3) · 3 = college question (1.4) ·
 * 4 = guardian step (3.1) · 5 = recording source (1.5) · 6 = heard about (1.7)
 *
 * 4 keeps its number so the guardian branch is untouched; the player's run is
 * 1 → 2 → 3 → 5 → 6.
 */
type Step = 1 | 2 | 3 | 4 | 5 | 6;

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
    sub: "A roster of players, one shared allowance.",
  },
  {
    id: "junior",
    icon: Shield,
    label: "I manage a junior's account",
    sub: "Parent or academy staff.",
  },
];

/** Screen 1.4's three answers, verbatim. */
const COLLEGE_OPTIONS: { id: CollegeAnswer; label: string; sub: string }[] = [
  {
    id: "yes",
    label: "Yes — I'm on a college roster",
    sub: "We'll help you find your program and ask your coach for access.",
  },
  {
    id: "no",
    label: "No — I play club, tournaments or juniors",
    sub: "Your own account, your own allowance.",
  },
  {
    id: "not_yet",
    label: "Not yet — I'm being recruited",
    sub: "Start on your own account; add a college team whenever you commit.",
  },
];

/**
 * Screen 1.5's card icons, keyed by answer. Copy comes from `RECORDING_SOURCES`
 * in `answers.ts` — the one vocabulary the server's allow-list checks against —
 * so only the glyph is decided here.
 */
const RECORDING_ICONS: Record<RecordingSource, typeof User> = {
  "swing-vision": FileSpreadsheet,
  video: Video,
  none: Smartphone,
};

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

export function OnboardingFlow() {
  const [step, setStep] = useState<Step>(1);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [persona, setPersona] = useState<Persona | null>(null);
  const [college, setCollege] = useState<CollegeAnswer | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [classYear, setClassYear] = useState("");
  const [consent, setConsent] = useState(false);
  const [recordingSource, setRecordingSource] =
    useState<RecordingSource | null>(null);
  const [acquisitionSource, setAcquisitionSource] =
    useState<AcquisitionSource | null>(null);
  const [acquisitionDetail, setAcquisitionDetail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (choice: OnboardingChoice) => {
    setError(null);
    startTransition(async () => {
      // Success redirects on the server; reaching the line below means the
      // write failed and there is a sentence to show.
      const result = await finishOnboarding({ choice, firstName, lastName });
      if (result && !result.ok) setError(result.error);
    });
  };

  // Both halves, non-blank. The server refuses anything less anyway
  // (`parseTypedName`); this keeps the button honest about what a tap will do.
  const nameReady = firstName.trim().length > 0 && lastName.trim().length > 0;

  const continueFromName = () => {
    if (!nameReady) return;
    setError(null);
    setStep(2);
  };

  const continueFromPersona = () => {
    if (!persona) return;
    setError(null);
    // Both branches only turn a page: "play" to the college question, "junior"
    // to the guardian step. Nothing is written until the branch's own submit,
    // so a guardian who bails on 3.1 is still gated into onboarding next time.
    if (persona === "play") {
      setStep(3);
      return;
    }
    if (persona === "junior") {
      setStep(4);
      return;
    }
    submit("coach");
  };

  // 1.4 no longer finishes: both exits turn the page to 1.5, and the college
  // answer is read when 1.7 submits. Skip clears it, so an answer tapped and
  // then skipped is not stored.
  const continueFromCollege = () => {
    if (!college) return;
    setError(null);
    setStep(5);
  };

  const skipCollege = () => {
    setCollege(null);
    setError(null);
    setStep(5);
  };

  const continueFromRecording = (source: RecordingSource | null) => {
    setRecordingSource(source);
    setError(null);
    setStep(6);
  };

  /**
   * The player's finish, from 1.7 — Continue with the answers on screen, Skip
   * with all three acquisition/recording answers null. (Skip on 1.7 nulls 1.5
   * too: the design's Skip is "stop asking me", and the server treats every
   * answer as optional.)
   *
   * PostHog runs before the action, not after: a successful action redirects
   * on the server and nothing after the await is guaranteed to run. Enum
   * values only — the free-text "Where?" detail is never sent, and neither is
   * any name or email.
   */
  const finishPlayer = (answers: {
    recordingSource: RecordingSource | null;
    acquisitionSource: AcquisitionSource | null;
    acquisitionSourceDetail: string | null;
  }) => {
    setError(null);
    if (isPostHogConfigured) {
      posthog.setPersonProperties({
        recording_source: answers.recordingSource,
        acquisition_source: answers.acquisitionSource,
      });
      posthog.capture("onboarding_completed", {
        persona,
        college,
        recording_source: answers.recordingSource,
        acquisition_source: answers.acquisitionSource,
      });
    }
    const choice: OnboardingChoice = college === "yes" ? "college" : "solo";
    startTransition(async () => {
      const result = await finishOnboarding({
        choice,
        firstName,
        lastName,
        ...answers,
      });
      if (result && !result.ok) setError(result.error);
    });
  };

  const finishFromHeardAbout = () => {
    if (!acquisitionSource) return;
    finishPlayer({
      recordingSource,
      acquisitionSource,
      acquisitionSourceDetail:
        acquisitionSource === "other" ? acquisitionDetail : null,
    });
  };

  const skipHeardAbout = () => {
    finishPlayer({
      recordingSource: null,
      acquisitionSource: null,
      acquisitionSourceDetail: null,
    });
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
        firstName,
        lastName,
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
        // The name step shares the persona step's 840 frame rather than the
        // design's 560: two fields side by side at 560 read as a sliver, and
        // one width across the first two screens keeps the eyebrow, title and
        // Continue from shifting between them. 1.5 takes the same 840 because
        // it is the same three-card row as 1.3.
        style={{
          maxWidth:
            step === 1 || step === 2 || step === 5
              ? 840
              : step === 4
                ? 584
                : 560,
        }}
      >
        <div
          className="flex min-w-0 flex-col"
          style={{ gap: step === 4 ? 20 : 28 }}
        >
          {step === 1 ? (
            // A form, so Enter from either field continues — the one step in
            // the flow that is typed rather than tapped. `contents` keeps the
            // parent's column gap running through it.
            <form
              className="contents"
              onSubmit={(event) => {
                event.preventDefault();
                continueFromName();
              }}
            >
              <ClaimHeading
                gap={8}
                step="Step 1"
                title="What should we call you?"
                body="Coaches and teammates see this name on every match you send. Type it the way you want it read."
                bodyMax="52ch"
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="onboarding-first-name"
                    className={CLAIM_LABEL}
                  >
                    First name
                  </label>
                  <input
                    id="onboarding-first-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    onBlur={() =>
                      setFirstName((value) => titleCaseTypedName(value))
                    }
                    // On, unlike the guardian's player field: the browser's
                    // saved identity IS this person, and a suggestion they
                    // can edit is not the OAuth string the design keeps out.
                    autoComplete="given-name"
                    autoFocus
                    maxLength={PERSON_NAME_MAX}
                    className={CLAIM_FIELD}
                  />
                </div>
                <div>
                  <label htmlFor="onboarding-last-name" className={CLAIM_LABEL}>
                    Last name
                  </label>
                  <input
                    id="onboarding-last-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    onBlur={() =>
                      setLastName((value) => titleCaseTypedName(value))
                    }
                    autoComplete="family-name"
                    maxLength={PERSON_NAME_MAX}
                    className={CLAIM_FIELD}
                  />
                </div>
              </div>
              <ClaimActions gap={16}>
                <button
                  type="submit"
                  disabled={!nameReady}
                  className={CLAIM_BUTTON}
                >
                  Continue
                </button>
                <span className={CLAIM_MICRO}>
                  Capitalized as you leave the field — &quot;marcus reid&quot;
                  becomes &quot;Marcus Reid&quot;.
                </span>
              </ClaimActions>
            </form>
          ) : step === 2 ? (
            <>
              <ClaimHeading
                gap={8}
                step="Step 2"
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
                        "focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
                        selected
                          ? "border-[var(--blue)] bg-[var(--blue-soft)]"
                          : "border-[var(--border-field)] bg-[var(--surface-card)] hover:bg-[var(--surface-subtle)]",
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-5",
                          selected
                            ? "text-[var(--blue)]"
                            : "text-[var(--ink-600)]",
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
                  onClick={continueFromPersona}
                  className={CLAIM_BUTTON}
                >
                  Continue
                </button>
                <span className={CLAIM_MICRO}>
                  Coaches and guardians take a different next step.
                </span>
              </ClaimActions>
            </>
          ) : step === 3 ? (
            <>
              <ClaimHeading
                gap={8}
                step="Step 3 of 5"
                title="Do you play for a college program?"
                body="This decides where your first matches go — and whether your coach is part of it."
                bodyMax="52ch"
              />
              <div
                role="radiogroup"
                aria-label="Do you play for a college program?"
                className="flex flex-col gap-2"
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
                        "flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-element)] border px-5 py-4 text-left transition-colors duration-[var(--duration-fast)]",
                        "focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
                        selected
                          ? "border-[var(--blue)] bg-[var(--blue-tint-08)]"
                          : "border-[var(--border-field)] bg-[var(--surface-card)] hover:bg-[var(--surface-subtle)]",
                      )}
                    >
                      {/* `leading-5` is load-bearing: Tailwind v4's
                          `text-[14px]` sets no line-height, and the dot's
                          `align` is that line box centred on the 14px mark —
                          (20 − 14) / 2. Change one and the other follows. */}
                      <RadioDot selected={selected} align="mt-[3px]" />
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="text-[14px] leading-5 text-[var(--ink-900)]">
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
                  onClick={continueFromCollege}
                  className={CLAIM_BUTTON}
                >
                  Continue
                </button>
                {/* Skip moves on as an individual player — the persona from
                    the step before still counts, only this question goes
                    unanswered (`college` stays null, which resolves to
                    `solo` when 1.7 submits). */}
                <button
                  type="button"
                  disabled={isPending}
                  onClick={skipCollege}
                  className={CLAIM_LINK}
                >
                  Skip
                </button>
              </ClaimActions>
            </>
          ) : step === 5 ? (
            <>
              {/* Screen 1.5 — how the player records. The step-2 persona
                  cards, re-used: the answer preselects the upload wizard's
                  source, it doesn't lock one out. */}
              <ClaimHeading
                gap={8}
                step="Step 4 of 5"
                title="How do you record your matches?"
                body="Your first upload is set up for this. You can use either later."
                bodyMax="60ch"
              />
              <div
                role="radiogroup"
                aria-label="How do you record your matches?"
                className="grid gap-3 sm:grid-cols-3"
              >
                {RECORDING_SOURCES.map((option) => {
                  const selected = recordingSource === option.value;
                  const Icon = RECORDING_ICONS[option.value];
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setRecordingSource(option.value)}
                      className={cn(
                        "flex cursor-pointer flex-col gap-2 rounded-[var(--radius-element)] border p-5 text-left transition-colors duration-[var(--duration-fast)]",
                        "focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
                        selected
                          ? "border-[var(--blue)] bg-[var(--blue-soft)]"
                          : "border-[var(--border-field)] bg-[var(--surface-card)] hover:bg-[var(--surface-subtle)]",
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-5",
                          selected
                            ? "text-[var(--blue)]"
                            : "text-[var(--ink-600)]",
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
                  disabled={!recordingSource || isPending}
                  onClick={() => continueFromRecording(recordingSource)}
                  className={CLAIM_BUTTON}
                >
                  Continue
                </button>
                {/* Skip stores null — the wizard then opens with no source
                    preselected, exactly as it does today. */}
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => continueFromRecording(null)}
                  className={CLAIM_LINK}
                >
                  Skip
                </button>
              </ClaimActions>
            </>
          ) : step === 6 ? (
            <>
              {/* Screen 1.7 — where the player heard about Advantage, and the
                  step that finishes the player's run. The 1.4 radio rows in
                  two columns; "Somewhere else" spans both and opens a short
                  free-text "Where?" under it, which is stored on the user row
                  only and never sent to analytics. */}
              <ClaimHeading
                gap={8}
                step="Step 5 of 5"
                title="How did you hear about Advantage?"
              />
              <div className="flex flex-col gap-4">
                <div
                  role="radiogroup"
                  aria-label="How did you hear about Advantage?"
                  className="grid gap-2 sm:grid-cols-2"
                >
                  {ACQUISITION_SOURCES.map((option) => {
                    const selected = acquisitionSource === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setAcquisitionSource(option.value)}
                        className={cn(
                          "flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-element)] border px-5 py-4 text-left transition-colors duration-[var(--duration-fast)]",
                          "focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
                          option.value === "other" && "sm:col-span-2",
                          selected
                            ? "border-[var(--blue)] bg-[var(--blue-tint-08)]"
                            : "border-[var(--border-field)] bg-[var(--surface-card)] hover:bg-[var(--surface-subtle)]",
                        )}
                      >
                        {/* Same `leading-5` / `mt-[3px]` pairing as 1.4's
                            rows — see the note there. */}
                        <RadioDot selected={selected} align="mt-[3px]" />
                        <span className="text-[14px] leading-5 text-[var(--ink-900)]">
                          {option.playerLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {acquisitionSource === "other" && (
                  <div>
                    <label
                      htmlFor="onboarding-acquisition-detail"
                      className={CLAIM_LABEL}
                    >
                      Where?
                    </label>
                    <input
                      id="onboarding-acquisition-detail"
                      value={acquisitionDetail}
                      onChange={(e) => setAcquisitionDetail(e.target.value)}
                      placeholder="A podcast, a newsletter, a clinic"
                      maxLength={ACQUISITION_DETAIL_MAX}
                      autoComplete="off"
                      className={CLAIM_FIELD}
                    />
                  </div>
                )}
              </div>
              <ClaimActions gap={16}>
                <button
                  type="button"
                  disabled={!acquisitionSource || isPending}
                  onClick={finishFromHeardAbout}
                  className={CLAIM_BUTTON}
                >
                  {/* actions.ts's RESOLUTION sends the college answer to
                      /claim/program?intent=join, not the dashboard — so this
                      label has to branch too, or it lies on the college path. */}
                  {college === "yes" ? "Find my program" : "Go to my dashboard"}
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={skipHeardAbout}
                  className={CLAIM_LINK}
                >
                  Skip
                </button>
              </ClaimActions>
            </>
          ) : (
            <>
              {/* Screen 3.1 — the guardian acknowledgment. Unlike 1.2–1.4
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
                  <ClaimSelect
                    id="guardian-class-year"
                    value={classYear}
                    onChange={(e) => setClassYear(e.target.value)}
                    className={cn(classYear === "" && "text-[var(--ink-400)]")}
                  >
                    <option value="" disabled>
                      Select year
                    </option>
                    {guardianClassYears().map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </ClaimSelect>
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-[var(--radius-element)] border border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-5 py-4">
                <span className="eyebrow">If the player is under 18</span>
                {/* The same 14px check the join page's sharing terms carry,
                    in ink and never blue. `AuthCheckbox` below fills Signal
                    Blue with a white check when it is set, and blue ticks here
                    would put four blue checkmarks in one column with only the
                    last one meaning anything. Ink keeps the accent on the one
                    control that records consent. */}
                <div className="flex flex-col">
                  {GUARDIAN_ACKNOWLEDGMENTS.map((row, index) => (
                    <div
                      key={row}
                      className={cn(
                        "flex gap-2.5",
                        index === 0
                          ? "pb-[9px]"
                          : "border-t border-[var(--border-hairline)] py-[9px]",
                        index === GUARDIAN_ACKNOWLEDGMENTS.length - 1 && "pb-0",
                      )}
                    >
                      <TermMark tone="ink" />
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
                    <a
                      href={GUARDIAN_TERMS_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-sm text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
                    >
                      Read the guardian terms
                    </a>
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
