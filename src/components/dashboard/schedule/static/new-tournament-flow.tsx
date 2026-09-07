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
 * ── Editing the same tournament ────────────────────────────────────────────
 * `mode="edit"` is these same two steps over a tournament that already exists.
 * Every difference follows from one fact — parts of the field have already
 * been played:
 *
 *   the draft   opens on the event's own weekend and its entered field, each
 *               entry carrying the `program_event_entries` id it came from.
 *               An entry submitted WITHOUT its id is one `planEntryChanges`
 *               reads as a delete and an insert, which orphans the matches
 *               hanging off it. See `tournamentSeed` below.
 *   settled     entries with a match or a forfeit are drawn read-only — draw
 *               AND seed, because `entry-plan.ts` compares both and a refusal
 *               takes the whole save with it.
 *   step one    stays reachable: a weekend's name, dates, site and format are
 *               all still the coach's to change. The pinned bar over step two
 *               therefore gets no `Change` — Back is the way, and there is one
 *               event either way, since the same `eventId` is submitted
 *               whatever the name says.
 *   the write   `updateTournament`, chosen inside `useTournamentDraft` by the
 *               seed carrying an `eventId`. Same footer, same `ActionError`.
 *
 * `adScoring` never passes through this file. The format is the `FORMATS` row
 * `TournamentWeekendStep` chose, and `useTournamentDraft().submit()` reads
 * `bestOf` and `adScoring` off it as literals — see `TournamentFormat` in
 * `static-tournament-builder.tsx` and `docs/ui-revamp-guardrails.md` §3.1. The
 * pinned bar below hands the same pair to `formatLabel` and parses nothing.
 */

import { useCallback, useMemo, useRef, useState } from "react";
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
  type TournamentEntrySeed,
} from "@/components/dashboard/schedule/static/static-tournament-builder";
import type { LadderPlayer } from "@/lib/data/roster-server";
import type { TournamentEntryInput } from "@/lib/schedule/actions";
import { isSettled } from "@/lib/schedule/entry-plan";
import { EVENT_FORMATS } from "@/lib/schedule/format";
import type { EventDetail } from "@/lib/schedule/types";

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

/**
 * What the flow is for.
 *
 * A discriminated pair rather than a loose optional event, so "an edit without
 * an event" is not a shape anybody can write — `new-dual-flow.tsx`'s
 * `NewDualFlowProps` for the same reason.
 */
export type NewTournamentFlowProps = {
  roster: LadderPlayer[];
  defaultSurface: string | null;
} & (
  | { mode?: "create"; event?: undefined }
  | { mode: "edit"; event: EventDetail }
);

/**
 * The event's saved format as one of the four option names the control offers.
 *
 * A lookup over the shared table, never a parse: `EVENT_FORMATS` states each
 * pair as literals, so this either finds the row or finds nothing. Nothing is
 * the honest answer for a tournament whose `ad_scoring` is null — the state
 * `docs/ui-revamp-guardrails.md` §3.1 and §4 exist about — and
 * `useTournamentDraft` then opens on the builder's own default rather than on
 * a `false` invented here to make the lookup succeed.
 */
function formatValueOf({ bestOf, adScoring }: EventDetail["event"]["format"]) {
  return EVENT_FORMATS.find(
    (option) => option.bestOf === bestOf && option.adScoring === adScoring
  )?.value;
}

/**
 * The event, as the draft the builder opens on.
 *
 * ── Which entries get a row ────────────────────────────────────────────────
 * The field step is ONE list over the roster, so a saved entry earns a row
 * only if the screen can actually express it: exactly one player, that player
 * still on the roster, and a draw the control offers. Everything else goes to
 * `carry` and is submitted back verbatim — a doubles pair this screen has no
 * way to make, an entry for somebody who has left the program, and above all
 * an entry that has moved on to a draw creation never offers (consolation, a
 * flight). Coercing that last one onto the row's two-option control would
 * quietly rewrite `draw` on save, or refuse the save outright once the entry
 * has been played. Dropping it would be worse still: `planEntryChanges` reads
 * an absence as a delete.
 */
function tournamentSeed(
  { event, entries }: EventDetail,
  roster: LadderPlayer[]
): TournamentDraftSeed {
  const onRoster = new Set(roster.map((player) => player.userId));
  const field: TournamentEntrySeed[] = [];
  const carry: TournamentEntryInput[] = [];

  for (const entry of entries) {
    const userId =
      entry.playerUserIds.length === 1 ? entry.playerUserIds[0] : null;
    const drawable =
      userId !== null &&
      onRoster.has(userId) &&
      entry.draw !== null &&
      DRAW_OPTIONS.includes(entry.draw);

    if (drawable && userId) {
      field.push({
        userId,
        draw: entry.draw ?? undefined,
        seed: entry.seed,
        id: entry.id,
        position: entry.position,
        // The labels the row was saved with, never re-derived from the
        // roster — see `FieldEntry.labels`.
        labels: entry.playerLabels,
        // The same question `planEntryChanges` asks at save, asked here so the
        // row is drawn read-only rather than refused later.
        locked: isSettled(entry)
          ? entry.forfeit !== null
            ? ("forfeited" as const)
            : ("played" as const)
          : undefined,
      });
      continue;
    }

    carry.push({
      id: entry.id,
      discipline: entry.discipline,
      position: entry.position,
      draw: entry.draw,
      seed: entry.seed,
      playerUserIds: entry.playerUserIds,
      playerLabels: entry.playerLabels,
    });
  }

  return {
    eventId: event.id,
    name: event.name,
    startsOn: event.startsOn,
    endsOn: event.endsOn,
    site: event.site,
    // `""` is "no surface", and is honoured as one — the column is nullable
    // and an absent surface is not "hard".
    surface: event.surface ?? "",
    format: formatValueOf(event.format),
    field,
    carry,
  };
}

/**
 * The two draws the field step's control offers, restated here.
 *
 * `DRAWS` is private to `static-tournament-builder.tsx` and stays that way —
 * this is the read side of the same rule, and the seed above needs to know
 * which saved draws have a row to sit on. Widening one without the other
 * shows an entry a control that cannot hold its own value.
 */
const DRAW_OPTIONS: readonly string[] = ["Main draw", "Qualifying"];

export function NewTournamentFlow({
  roster,
  defaultSurface,
  mode,
  event,
}: NewTournamentFlowProps) {
  const editing = mode === "edit";
  // Memoised because `useTournamentDraft` seeds its entered map from this
  // object once. A fresh one per render would be a fresh `carry` array on
  // every keystroke — harmless, and still not what the hook describes.
  const initial = useMemo(
    () => (event ? tournamentSeed(event, roster) : undefined),
    [event, roster]
  );

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

  const eventHref = event
    ? `/dashboard/team/schedule/${event.event.id}`
    : SCHEDULE_HREF;
  // What the click will write: the rows on screen plus the ones the field step
  // cannot draw and submits back untouched. Counting only the visible rows
  // would tell a coach their save drops entries it does not touch.
  const entryCount = field.length + (initial?.carry?.length ?? 0);

  const lastStep = step === 2;
  // `createTournament` refuses an unnamed tournament and refuses a weekend with
  // no dates, so the button is asleep until there is one to write — and asleep
  // again while the write is in flight, so a second click cannot create a
  // second tournament.
  const continueDisabled = lastStep
    ? pending || entryCount === 0
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
            /* No handler at all on an edit: Back is the way to step one,
               and a second control saying the same thing is a second control
               to keep honest. `PinnedEventBar` draws no `Change` without
               one. */
            onChange={editing ? undefined : back}
          />
        ) : undefined
      }
      contentRef={contentRef}
      contentKey={step}
      contentClassName="mt-9"
      back={lastStep ? back : undefined}
      // An edit's way out is the event it came from — the page the coach
      // opened this from, and the one they can read either way.
      cancelHref={editing && event ? eventHref : SCHEDULE_HREF}
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
            {editing ? "Saves" : "Creates"}{" "}
            <span className="tabular">{entryCount}</span>{" "}
            {entryCount === 1 ? "entry" : "entries"} and no matches — a match
            exists once it&#39;s played
          </span>
        ) : null
      }
      continueLabel={
        lastStep
          ? editing
            ? pending
              ? "Saving…"
              : "Save changes"
            : pending
              ? "Creating…"
              : "Create tournament"
          : "Continue"
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
