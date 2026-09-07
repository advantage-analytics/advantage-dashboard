"use client";

/**
 * `NewTournamentFlow` — the new tournament as two steps of the upload wizard's
 * chrome.
 *
 * Same room as `/dashboard/matches/new`, `[eventId]/score` and the new dual,
 * deliberately: the full-bleed step indicator under the app header, an optional
 * pinned bar beneath it, the 832px centred column with its "Step N of M"
 * eyebrow, title and lede, and the sticky 64px footer. `WizardShell` draws all
 * of it (`matches/new-match-wizard/WizardShell.tsx`) and this file decides
 * nothing about how it looks — only which step is showing, what it is waiting
 * on, and what Continue does when it wakes.
 *
 * ── Two panes became two steps ─────────────────────────────────────────────
 * `3c` drew one frame: a roster rail on the left, and the weekend's five facts
 * over an entries table on the right. Under the shell that is the weekend and
 * then the field, because the shell's Continue is a single primary and a frame
 * with two unrelated requirements in it has nothing sensible for that button to
 * gate on. The rail and the entries table are gone with the split — the field
 * step is one list over the roster, each row carrying its own draw and seed.
 * See `TournamentFieldStep`.
 *
 * ── The shape ──────────────────────────────────────────────────────────────
 * One component. `useTournamentDraft` needs no answer from step one to be
 * called — unlike the dual's `useDualDraft`, which needs a school — so the
 * draft is held here across both steps and nothing is keyed or remounted.
 * Walking back to the weekend leaves the field exactly as it was entered.
 *
 * ── What Continue is waiting on ────────────────────────────────────────────
 *   step 1   a name and both dates. `createTournament` refuses an unnamed
 *            tournament and refuses an end before a start, and a date input is
 *            a control a coach can empty back to nothing.
 *   step 2   somebody in the field. The footer prints how many entries the
 *            click will create beside the button.
 *
 * `adScoring` never passes through this file. The format is the `FORMATS` row
 * `TournamentWeekendStep` chose, and `useTournamentDraft().submit()` reads
 * `bestOf` and `adScoring` off it as literals — see `TournamentFormat` in
 * `static-tournament-builder.tsx` and `docs/ui-revamp-guardrails.md` §3.1. The
 * pinned bar below hands the same pair to `formatLabel` and parses nothing.
 */

import { useCallback, useRef, useState } from "react";
/* Straight from the two files, not the wizard's barrel: `index.ts` re-exports
   `UploadMatchFlow` and its whole subtree, and this flow needs the chrome and
   the keys — the same call `new-dual-flow.tsx` made. */
import { WizardShell } from "@/components/dashboard/matches/new-match-wizard/WizardShell";
import { useWizardKeys } from "@/components/dashboard/matches/new-match-wizard/useWizardKeys";
import { PinnedEventBar } from "@/components/dashboard/schedule/static/pinned-event-bar";
import {
  TournamentFieldStep,
  TournamentWeekendStep,
  useTournamentDraft,
  type TournamentDraftSeed,
} from "@/components/dashboard/schedule/static/static-tournament-builder";
import type { LadderPlayer } from "@/lib/data/roster-server";

/** Where Cancel goes on step one. Inside the rebuilt set. */
const SCHEDULE_HREF = "/dashboard/team/schedule";

type Step = 1 | 2;

/** What each step asks, in the shell's own two lines. */
const COPY: Record<Step, { title: string; lede: string }> = {
  1: {
    title: "The weekend.",
    lede: "Name it, say when and where. A tournament holds entries rather than lines — the field comes next.",
  },
  2: {
    title: "The field.",
    lede: "Add players from the roster. An entry says where they start, not what they'll play.",
  },
};

export function NewTournamentFlow({
  roster,
  defaultSurface,
  initial,
}: {
  roster: LadderPlayer[];
  defaultSurface: string | null;
  /** The shape T20's edit mode hands in. Unset for a new tournament. */
  initial?: TournamentDraftSeed;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>(1);
  const {
    draft,
    edit,
    entered,
    enter,
    remove,
    amend,
    field,
    submit,
    pending,
    error,
  } = useTournamentDraft(roster, defaultSurface, initial);

  const back = useCallback(() => setStep(1), []);

  const lastStep = step === 2;
  // `createTournament` refuses an unnamed tournament and refuses a weekend with
  // no dates, so the button is asleep until there is one to write — and asleep
  // again while the write is in flight, so a second click cannot create a
  // second tournament.
  const continueDisabled = lastStep
    ? pending || field.length === 0
    : draft.name.trim() === "" ||
      draft.startsOn === "" ||
      draft.endsOn === "";

  const onContinue = useCallback(() => {
    if (lastStep) {
      submit();
      return;
    }
    setStep(2);
  }, [lastStep, submit]);

  useWizardKeys({
    contentRef,
    canGoBack: lastStep,
    onBack: back,
    continueDisabled,
    onContinue,
  });

  return (
    <WizardShell
      stepIndex={step - 1}
      stepCount={2}
      title={COPY[step].title}
      description={COPY[step].lede}
      pinned={
        /* The weekend step one described, pinned over the field that inherits
           it — and the way back to change it. An unnamed weekend never gets
           here: Continue is asleep until the name and both dates exist. */
        lastStep ? (
          <PinnedEventBar
            kind="tournament"
            name={draft.name}
            date={draft.startsOn || null}
            endDate={draft.endsOn || null}
            site={draft.site}
            /* The chosen `FORMATS` row's two literals — never a parse, and
               never a `null` standing in as `false`. */
            format={{
              bestOf: draft.format.bestOf,
              adScoring: draft.format.adScoring,
            }}
            onChange={back}
          />
        ) : undefined
      }
      contentRef={contentRef}
      contentKey={step}
      contentClassName="mt-9"
      back={lastStep ? back : undefined}
      cancelHref={SCHEDULE_HREF}
      status={
        error ? (
          // `createTournament`'s own sentence, in the count line's place. A
          // refusal that only turned the button off would leave a coach
          // re-clicking a form that had already said why it could not save.
          <span className="text-[11px]" style={{ color: "var(--danger)" }}>
            {error}
          </span>
        ) : lastStep ? (
          <span className="text-[11px]" style={{ color: "var(--ink-600)" }}>
            Creates <span className="tabular">{field.length}</span>{" "}
            {field.length === 1 ? "entry" : "entries"} and no matches — a match
            exists once it&#39;s played
          </span>
        ) : null
      }
      continueLabel={
        lastStep ? (pending ? "Creating…" : "Create tournament") : "Continue"
      }
      onContinue={onContinue}
      continueDisabled={continueDisabled}
    >
      {step === 1 ? (
        <TournamentWeekendStep draft={draft} onEdit={edit} />
      ) : (
        <TournamentFieldStep
          roster={roster}
          entered={entered}
          onEnter={enter}
          onRemove={remove}
          onAmend={amend}
        />
      )}
    </WizardShell>
  );
}
