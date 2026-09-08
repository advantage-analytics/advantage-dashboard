"use client";

/**
 * `NewDualFlow` — the new dual as three steps of the upload wizard's chrome.
 *
 * Same room as `/dashboard/matches/new` and `[eventId]/score`, deliberately:
 * the full-bleed step indicator under the app header, an optional pinned bar
 * beneath it, the 832px centred column with its "Step N of M" eyebrow, title
 * and lede, and the sticky 64px footer. `WizardShell` draws all of it
 * (`matches/new-match-wizard/WizardShell.tsx`) and this file decides nothing
 * about how it looks — only which step is showing, what it is waiting on, and
 * what Continue does when it wakes.
 *
 * ── Two steps became three ─────────────────────────────────────────────────
 * `2c` asked for the school and `2b` asked for everything else in one frame:
 * four facts across the top, then nine courts under them. Under the shell the
 * facts and the lineup are two steps rather than one long scroll, because the
 * shell's Continue is a single primary and a frame with two unrelated
 * requirements in it has nothing sensible for that button to gate on. The
 * bodies did not change — `DualFactsStep` and `DualLineupStep` are the same
 * two components T14 cut out of `DualBuildStep`, and the composite that used
 * to frame them is gone with `static-dual-builder.tsx`.
 *
 * ── The shape: who holds what ──────────────────────────────────────────────
 * `useDualDraft(school)` needs a school, and a hook cannot be called on some
 * renders and not others. So the flow is two components:
 *
 *   `NewDualFlow`        owns `step` and `school`, and nothing else.
 *   `DualDraftFlow`      mounts only once a school exists, calls
 *                        `useDualDraft` unconditionally, and draws all three
 *                        steps — step one included.
 *
 * Step one is therefore drawn twice, from one `SchoolStep` body: by the outer
 * component before any school has been chosen, and by the inner one on the
 * way back. That is the price of the draft surviving a return trip. `Change`
 * on the pinned bar sets `step` back to 1 and leaves `school` alone, so the
 * inner component stays mounted with the date, site, surface, format and nine
 * courts the coach has already typed. Picking a DIFFERENT school changes the
 * inner component's `key` and reseeds the whole draft — a lineup entered
 * against one opponent is not a lineup against another, and the opponent
 * names typed on those rows least of all.
 *
 * The alternative was lifting the draft into `NewDualFlow` and passing it
 * down, which would have meant either exporting `useDualDraft`'s eleven return
 * values as a prop bundle or moving the hook's call site out of the file that
 * documents it. Keying a mounted child is the smaller move and states the
 * reseed rule in one line.
 *
 * ── What Continue is waiting on ────────────────────────────────────────────
 *   step 1   a school. `DualSchoolStep` still owns the picked row and the
 *            typed term; it reports what Continue would carry through
 *            `onChoiceChange`, and null there is what disables the button.
 *   step 2   a date. The other three facts open on real values — home, the
 *            program's `default_surface`, `2b`'s format — and a date is the
 *            one a `DateField` can be cleared back to empty: delete its
 *            segments and it reports `""`.
 *   step 3   a line. `createDual` refuses a dual with no lines, and the
 *            footer prints how many there are beside the button.
 *
 * ── Editing the same dual ──────────────────────────────────────────────────
 * `mode="edit"` is this flow's steps two and three over a dual that already
 * exists. Everything below is the same component; four things differ, and each
 * is a consequence of one fact — the opponent is fixed once lines point at it:
 *
 *   the school   comes from the event rather than from step one, is pinned
 *                with no `Change`, and step one is unreachable. `PinnedEventBar`
 *                takes no `onChange` at all rather than a disabled one.
 *   the draft    opens on the event's own facts and its nine saved lines,
 *                each carrying the `program_event_entries` id it came from —
 *                see `dualSeed` below and `DualLineSeed.id` for why a lineup
 *                submitted without ids is a lineup `planEntryChanges` reads as
 *                nine deletes and nine inserts.
 *   settled      lines with a match or a forfeit are drawn read-only. The save
 *                would refuse to move them anyway, and a refusal is total, so
 *                an editable row would take a whole retyped lineup and then
 *                reject it.
 *   the write    `updateDual`, chosen inside `useDualDraft` by the seed
 *                carrying an `eventId`. Same footer, same `ActionError`.
 *
 * ── The format ─────────────────────────────────────────────────────────────
 * `adScoring` never passes through this file. The format is the `FORMATS` row
 * `DualFactsStep` chose, and `useDualDraft().submit()` reads `bestOf` and
 * `adScoring` off it as literals — see `DualFormat` in `dual-build-step.tsx`
 * and `docs/ui-revamp-guardrails.md` §3.1. The pinned bar below hands the same
 * pair to `formatLabel` and parses nothing.
 */

import { useCallback, useMemo, useRef, useState } from "react";
/* Straight from the two files, not the wizard's barrel: `index.ts` re-exports
   `UploadMatchFlow` and its whole subtree, and this flow needs the chrome and
   the keys — the same call `score-only-flow.tsx` made. */
import { WizardShell } from "@/components/dashboard/matches/new-match-wizard/WizardShell";
import { useWizardKeys } from "@/components/dashboard/matches/new-match-wizard/useWizardKeys";
import { PinnedEventBar } from "@/components/dashboard/schedule/static/pinned-event-bar";
import { DualSchoolStep } from "@/components/dashboard/schedule/static/dual-school-step";
import {
  DualFactsStep,
  DualLineupStep,
  useDualDraft,
  type ChosenSchool,
  type DualDraftSeed,
} from "@/components/dashboard/schedule/static/dual-build-step";
import { divisionLabel } from "@/lib/data/programs-server";
import { formatValueOf } from "@/lib/schedule/format";
import { isSettled } from "@/lib/schedule/entry-plan";
import type { ProgramSearchResult } from "@/lib/data/programs-server";
import type { EventDetail } from "@/lib/schedule/types";

/** Where Cancel goes on step one. Inside the rebuilt set. */
const SCHEDULE_HREF = "/dashboard/team/schedule";

type Step = 1 | 2 | 3;

/** What each step asks, in the shell's own two lines. */
const COPY: Record<Step, { title: string; lede: string }> = {
  1: {
    title: "Who are you playing?",
    lede: "The school decides the lineup you fill in later. Pick a program, or type any opponent the directory never had.",
  },
  2: {
    title: "When it's played, and how.",
    lede: "Four facts the whole dual inherits. Every one of the nine lines is created under them.",
  },
  3: {
    title: "The lineup.",
    lede: "Six singles and three doubles. Your side is seeded from the ladder — type over a name to put a sub on.",
  },
};

/** The one place a `ChosenSchool` is built out of step one's two answers. */
function chosenFrom(
  name: string,
  program: ProgramSearchResult | null
): ChosenSchool {
  // The row alone for a pick — its name is read off it downstream — and the
  // text alone otherwise, so the two can never disagree.
  return program ? { kind: "program", program } : { kind: "text", name };
}

/**
 * The key a draft is reseeded on.
 *
 * `useDualDraft` stamps its opponent-roster fetch with the same string; this
 * is the outer half of the same rule, one level up — a change of school is a
 * change of draft, not a change of one field inside it.
 */
function schoolKey(school: ChosenSchool): string {
  return school.kind === "program"
    ? `program:${school.program.programKey}`
    : `text:${school.name}`;
}

/**
 * What the flow is for.
 *
 * A discriminated pair rather than three loose optional props, so "an edit
 * without an event" is not a shape anybody can write. `opponentProgram` is the
 * opponent's directory row where the ROUTE could resolve one — `EventEntry`
 * carries the opponent's program id and nothing else, and
 * `opponentRosterForDual` is keyed on `program_key`, so the lookup belongs to
 * the server. Null is a real answer (a dual entered as free text): the school
 * is then pinned from `event.name`, the opponent-name popups offer no saved
 * roster, and nothing else changes.
 */
export type NewDualFlowProps =
  | { mode?: "create"; event?: undefined; opponentProgram?: undefined }
  | {
      mode: "edit";
      event: EventDetail;
      opponentProgram?: ProgramSearchResult | null;
    };

/** The edit's two facts, once the props say there is one. */
interface DualEditTarget {
  detail: EventDetail;
  opponentProgram: ProgramSearchResult | null;
}

/**
 * The event, as the draft the builder opens on.
 *
 * Keyed by slot, because that is what `LineupLine.key` is: an entry whose slot
 * is not one of the nine courts (a dual has no such row — the column is 'S1'…
 * 'D3' — but the type allows null) matches no seeded line and is simply not
 * applied.
 *
 * Both sides are joined back into ONE label, which is how the builder holds a
 * doubles pair: `useDualDraft` splits on `/` at the boundaries and nowhere
 * else. `id` rides on every loaded line — see `DualLineSeed.id`.
 */
export function dualSeed({ event, entries }: EventDetail): DualDraftSeed {
  return {
    eventId: event.id,
    date: event.startsOn,
    site: event.site,
    // `""` is "no surface", and is honoured as one — the column is nullable
    // and an absent surface is not "hard".
    surface: event.surface ?? "",
    format: formatValueOf(event.format),
    lines: entries.flatMap((entry) =>
      entry.slot
        ? [
            {
              key: entry.slot,
              id: entry.id,
              ourLabels: [entry.playerLabels.join(" / ")],
              theirLabels: [entry.opponentLabels.join(" / ")],
              forfeit: entry.forfeit,
              // The same question `planEntryChanges` asks at save, asked here
              // so the row is drawn read-only rather than refused later.
              locked: isSettled(entry)
                ? entry.forfeit !== null
                  ? ("forfeited" as const)
                  : ("played" as const)
                : undefined,
            },
          ]
        : []
    ),
  };
}

export function NewDualFlow(props: NewDualFlowProps) {
  const edit: DualEditTarget | undefined = useMemo(
    () =>
      props.mode === "edit"
        ? {
            detail: props.event,
            opponentProgram: props.opponentProgram ?? null,
          }
        : undefined,
    [props.mode, props.event, props.opponentProgram]
  );

  // An edit opens on step two: its school is the event's, already decided.
  const [step, setStep] = useState<Step>(edit ? 2 : 1);
  const [school, setSchool] = useState<ChosenSchool | null>(
    edit
      ? edit.opponentProgram
        ? { kind: "program", program: edit.opponentProgram }
        : // The name the dual was recorded under, which is the name it keeps:
          // `updateDual` does not take an opponent at all.
          { kind: "text", name: edit.detail.event.name }
      : null
  );

  const choose = useCallback(
    (name: string, program: ProgramSearchResult | null) => {
      setSchool(chosenFrom(name, program));
      setStep(2);
    },
    []
  );

  if (school === null) {
    return <SchoolStep onChoose={choose} />;
  }

  return (
    <DualDraftFlow
      // A different school is a different draft. Same school, same key, same
      // draft — which is what makes `Change` a round trip and not a reset. An
      // edit's school never changes, so this key never moves.
      key={schoolKey(school)}
      school={school}
      edit={edit}
      step={step}
      onStep={setStep}
      onChoose={choose}
    />
  );
}

/**
 * Step one under the shell.
 *
 * A component of its own because both halves of the flow draw it — the outer
 * one before a school exists, the inner one on the way back from `Change` —
 * and one body is how the two stay the same screen.
 *
 * The choice lives in `DualSchoolStep` and is reported up here rather than
 * lifted: this component needs to know only whether there IS one, to gate the
 * button, and what it is, to hand to `onChoose`.
 */
function SchoolStep({
  onChoose,
  back,
}: {
  onChoose: (name: string, program: ProgramSearchResult | null) => void;
  /** Present only on the way back from a later step. */
  back?: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  /** What Continue would carry. Null until something is picked or typed. */
  const choice = useRef<{ name: string | null; program: ProgramSearchResult | null }>({
    name: null,
    program: null,
  });
  // A ref holds the choice and this holds the button's state, so a keystroke
  // in the search field re-renders the shell only when the answer crosses
  // between "nothing" and "something" — not on every character.
  const [hasChoice, setHasChoice] = useState(false);

  const onChoiceChange = useCallback(
    (name: string | null, program: ProgramSearchResult | null) => {
      choice.current = { name, program };
      setHasChoice(name !== null);
    },
    []
  );

  const commit = useCallback(() => {
    const { name, program } = choice.current;
    if (name === null) return;
    onChoose(name, program);
  }, [onChoose]);

  useWizardKeys({
    contentRef,
    canGoBack: back !== undefined,
    onBack: back ?? (() => {}),
    continueDisabled: !hasChoice,
    onContinue: commit,
  });

  return (
    <WizardShell
      stepIndex={0}
      stepCount={3}
      title={COPY[1].title}
      description={COPY[1].lede}
      contentRef={contentRef}
      contentKey="school"
      contentClassName="mt-9"
      back={back}
      cancelHref={SCHEDULE_HREF}
      continueLabel="Continue"
      onContinue={commit}
      continueDisabled={!hasChoice}
    >
      <DualSchoolStep onContinue={onChoose} onChoiceChange={onChoiceChange} />
    </WizardShell>
  );
}

/**
 * The flow once a school exists: the draft, and all three steps over it.
 *
 * Mounted with `school` non-null and keyed on it, so `useDualDraft` is called
 * unconditionally and exactly once per school. See this file's header for why
 * step one is inside here as well as outside it.
 */
function DualDraftFlow({
  school,
  edit,
  step,
  onStep,
  onChoose,
}: {
  school: ChosenSchool;
  /** Present only on an edit — see this file's header. */
  edit?: DualEditTarget;
  step: Step;
  onStep: (step: Step) => void;
  onChoose: (name: string, program: ProgramSearchResult | null) => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  // Memoised because `useDualDraft` keys its settled-line and id maps on this
  // object's `lines`. A fresh array each render would rebuild both on every
  // keystroke — harmless, and still not what the hook's contract describes.
  const seed = useMemo(
    () => (edit ? dualSeed(edit.detail) : undefined),
    [edit]
  );
  const {
    draft,
    edit: editDraft,
    lines,
    locked,
    pool,
    laddered,
    editOurLabels,
    editTheirLabels,
    setForfeited,
    lineCount,
    opponentName,
    submit,
    pending,
    error,
  } = useDualDraft(school, seed);

  const back = useCallback(() => {
    onStep(step === 3 ? 2 : 1);
  }, [onStep, step]);

  const lastStep = step === 3;
  // An edit has no step one to walk back to — the opponent is fixed — so step
  // two's way out is Cancel, back to the event it came from.
  const canGoBack = step !== 1 && (step === 3 || edit === undefined);
  const eventHref = edit
    ? `/dashboard/team/schedule/${edit.detail.event.id}`
    : SCHEDULE_HREF;
  // `createDual` refuses a dual with no lines, so the button is asleep until
  // there is one to write — and asleep again while the write is in flight, so
  // a second click cannot create a second dual.
  const continueDisabled = lastStep
    ? pending || lineCount === 0
    : draft.date.trim() === "";

  const onContinue = useCallback(() => {
    if (lastStep) {
      submit();
      return;
    }
    onStep(3);
  }, [lastStep, submit, onStep]);

  // Inert on step one, where `SchoolStep` below registers its own: two live
  // handlers would mean one Enter both committing the school AND advancing to
  // step three, and one Escape stepping back twice.
  useWizardKeys({
    contentRef,
    canGoBack,
    onBack: back,
    continueDisabled: step === 1 || continueDisabled,
    onContinue,
  });

  if (step === 1) {
    // The draft is still mounted above this branch — this component is what
    // holds it — so everything already typed is waiting on the way back. No
    // `back`: step one is the first step, and its way out is Cancel.
    return <SchoolStep onChoose={onChoose} />;
  }

  const program = school.kind === "program" ? school.program : null;
  // "Big Ten · D-I" — conference first, the artboard's order. Only a directory
  // row knows either, so a typed opponent pins no subline rather than an
  // invented one.
  const subline = program
    ? [program.conference, divisionLabel(program.division)]
        .filter(Boolean)
        .join(" · ") || null
    : null;

  return (
    <WizardShell
      stepIndex={step - 1}
      stepCount={3}
      title={COPY[step].title}
      description={COPY[step].lede}
      pinned={
        /* The answer step one gave, pinned for the two steps that inherit it —
           and the way back to change it. The facts join it as they are
           entered: a date the coach has cleared prints nothing rather than
           an empty glyph. */
        <PinnedEventBar
          kind="dual"
          // On an edit, the name the dual is already recorded under — the one
          // `updateDual` does not take and cannot change.
          name={edit ? edit.detail.event.name : opponentName}
          subline={subline}
          date={draft.date || null}
          site={draft.site}
          /* The chosen `FORMATS` row's two literals — never a parse, and never
             a `null` standing in as `false`. */
          format={{
            bestOf: draft.format.bestOf,
            adScoring: draft.format.adScoring,
          }}
          // No handler at all on an edit: a dual's school is fixed once its
          // lines point at it, and a control that can never do anything is not
          // a control. `PinnedEventBar` draws no `Change` without one.
          onChange={edit ? undefined : () => onStep(1)}
        />
      }
      contentRef={contentRef}
      contentKey={step}
      contentClassName={step === 2 ? "mt-9" : "mt-9 flex flex-col gap-[22px]"}
      back={canGoBack ? back : undefined}
      // Only ever reached when there is no Back — the shell draws one or the
      // other. On an edit that is step two, and its way out is the event.
      cancelHref={eventHref}
      status={
        error ? (
          // `createDual`'s own sentence, in the count line's place. A refusal
          // that only turned the button off would leave a coach re-clicking a
          // form that had already said why it could not save.
          <span className="text-[11px]" style={{ color: "var(--danger)" }}>
            {error}
          </span>
        ) : lastStep ? (
          <span className="text-[11px]" style={{ color: "var(--ink-600)" }}>
            {edit ? "Saves" : "Creates"}{" "}
            <span className="tabular">{lineCount}</span>{" "}
            {lineCount === 1 ? "line" : "lines"} vs{" "}
            {edit ? edit.detail.event.name : opponentName}
          </span>
        ) : null
      }
      continueLabel={
        lastStep
          ? edit
            ? pending
              ? "Saving…"
              : "Save changes"
            : pending
              ? "Creating…"
              : "Create dual"
          : "Continue"
      }
      onContinue={onContinue}
      continueDisabled={continueDisabled}
    >
      {step === 2 ? (
        <DualFactsStep draft={draft} onEdit={editDraft} />
      ) : (
        <DualLineupStep
          lines={lines}
          // Empty on a create — nothing has been played yet.
          locked={locked}
          pool={pool}
          laddered={laddered}
          onOurLabels={editOurLabels}
          onTheirLabels={editTheirLabels}
          onForfeit={setForfeited}
        />
      )}
    </WizardShell>
  );
}
