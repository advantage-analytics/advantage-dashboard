"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GripVertical, LockKeyhole, Plus, X } from "lucide-react";
import { Reorder, useDragControls, useReducedMotion } from "framer-motion";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { BENCH, aboveBench, moveToken } from "@/lib/schedule/singles-order";
import { cn } from "@/lib/utils";
import { DateField } from "@/components/ui/date-field";
import { MenuSelect, type MenuOption } from "@/components/ui/menu-select";
import {
  createTournament,
  updateTournament,
  type TournamentEntryInput,
} from "@/lib/schedule/actions";
import type { LadderPlayer } from "@/lib/data/roster-server";
import type { EventSite } from "@/lib/schedule/types";
import { todayISO, type EventFormatValue } from "@/lib/schedule/format";
import {
  FORMATS,
  FieldCell,
  SITES,
  formatOptions,
  type DualFormat,
} from "@/components/dashboard/schedule/static/event-fact-fields";

/**
 * `3c`, taken apart: the tournament draft, the weekend, and the field.
 *
 * ── What this file is now ──────────────────────────────────────────────────
 * Four exports and no screen. `useTournamentDraft` holds the draft and owns
 * the write; `TournamentNameStep` asks for the name, `TournamentDetailsStep`
 * the dates, site and format; `TournamentFieldStep` draws the roster and who
 * is in the field. `new-tournament-flow.tsx` frames the three bodies as three
 * steps of `WizardShell`, the same chrome
 * `/dashboard/matches/new` and the new dual use, and decides nothing about
 * either body's contents.
 *
 * The composite that used to frame them — the two-pane master–detail
 * `StaticTournamentBuilder`, its roster rail, its `+` control, its separate
 * entries table and the Big Ten callout the artboard drew — is gone with this
 * change. What replaced the two panes is ONE list: the roster, top to bottom,
 * each row carrying the draw and the seed that would otherwise live in a
 * second table. A field is a set of answers about roster players, and the
 * second pane only ever restated rows the first one already had.
 *
 * ── Writing ────────────────────────────────────────────────────────────────
 * `submit()` calls `createTournament` in `lib/schedule/actions.ts` — or
 * `updateTournament`, when the seed it opened on carries an `eventId`. The
 * create half: It re-resolves the workspace, refuses a caller who is
 * not staff here, writes the event and its entries, and rolls the event back if
 * the entries fail, so a tournament with nobody in it is never left on the
 * schedule. Its `ActionError` is a sentence meant for the coach: it is held in
 * `error` below and printed in the flow's status slot rather than swallowed
 * into a button that just stops working. Only on success does this navigate,
 * and it navigates to the event the action reports.
 *
 * The update half is the same call plus `planEntryChanges`, which decides
 * which saved entries may move. It refuses to re-point or delete an entry a
 * match points at, and a refusal is TOTAL — nothing is written. So a settled
 * entry is drawn read-only here rather than editable-and-then-rejected: draw
 * and seed both, because `changed()` in `entry-plan.ts` compares both on a
 * tournament row. See `FieldEntry.locked`, `FieldEntry.position` and
 * `FieldEntry.labels` for the three fields an edit has to carry back
 * untouched so that a coach entering one new player is not told somebody
 * else's finished match is in the way.
 *
 * `host` goes as null on purpose. `3c` draws no Hosted-by cell,
 * `createTournament` takes the field, and inventing a host is inventing a fact
 * about the weekend nobody entered.
 *
 * ── One row per player, so two lists cannot describe different people ──────
 * The failure mode of the old master–detail was a right-hand pane naming one
 * person over another person's facts. It is not expressible now: there is one
 * list, `roster`, and every row's draw and seed are read out of `entered` by
 * `player.userId` — never by name, never by list index. `field` is a `flatMap`
 * over that same array in the same order, so a seed can only ever be written
 * beside the player whose row it came from.
 *
 * The program's `defaultSurface` arrives all the same, because
 * `createTournament` takes a surface and the artboard asks for none. It sits in
 * the draft rather than on screen: an event created here carries the surface
 * the program already answered, or none at all — never a court type invented on
 * its behalf.
 */

/**
 * What one entered player is: where they start and their seed.
 *
 * Keyed by `LadderPlayer.userId` in the map below, never by name or by index —
 * a name key is how "Seed 3" ends up under the wrong person once two rows share
 * a surname, and an index key is how it happens the moment a row is removed.
 *
 * `draw` is one of `DRAWS` and nothing else. `seed` is the STRING the seed cell
 * holds rather than a number, which is what lets "nothing typed" and "0" stay
 * different answers all the way to the write: the empty string becomes a null
 * column, and a number only exists once somebody typed one. Parsing at every
 * keystroke is how an empty field becomes `NaN` and a cleared one becomes 0.
 */
export interface FieldEntry {
  draw: string;
  seed: string;
  /**
   * The `program_event_entries` row this cell came from, on an edit.
   *
   * It rides all the way back into the submitted row. `planEntryChanges`
   * matches an incoming entry by id where it has one and by its
   * `<draw> #<position>` label otherwise, so an entry loaded and submitted
   * WITHOUT its id is an entry the planner reads as a delete and an insert —
   * which orphans the matches hanging off it, or is refused outright.
   */
  id?: string;
  /**
   * The position the saved row already holds.
   *
   * Kept rather than recomputed, because `planEntryChanges` compares
   * `position` and refuses a settled entry whose value moved. A fresh entry
   * above a played one in ladder order would otherwise shift every position
   * below it and refuse the whole save — a coach entering one new player told
   * that somebody else's finished match is in the way. New entries take the
   * next free position instead; see `submit()`.
   */
  position?: number;
  /**
   * The labels the saved row was written with, for the same reason.
   *
   * `program_event_entries.player_labels` is written once and never
   * re-derived, so a roster rename since would make a re-derived label read as
   * an edit — and a refusal on a settled entry nobody touched.
   */
  labels?: string[];
  /**
   * Settled, and how — a match points at this entry, or a side forfeited.
   *
   * The same question `planEntryChanges`'s `isSettled` asks at save, asked
   * here so the row is drawn read-only rather than retyped and then refused.
   * A refusal is total, so an editable settled row would take a whole edited
   * field and reject it.
   */
  locked?: "played" | "forfeited";
}

/** The five facts the weekend step asks for, plus the one it does not draw. */
export interface TournamentDraft {
  name: string;
  /** YYYY-MM-DD, as `program_events.starts_on` stores it. */
  startsOn: string;
  endsOn: string;
  site: EventSite;
  format: TournamentFormat;
  /**
   * The program's `default_surface`, or `""` when it has never set one. No cell
   * on this screen edits it — `3c` draws none — and `createTournament` turns an
   * empty string into a null column.
   */
  surface: string;
}

/**
 * One entered player a caller can open the builder on.
 *
 * `userId` rather than an index, for `FieldEntry`'s reason: an index seed is
 * exactly how a draw and a seed land on the wrong athlete. A `userId` matching
 * nobody on the roster is simply not applied — a player who has left the
 * program cannot be re-entered by a stale seed.
 *
 * `seed` is a NUMBER here and `null` is a real value: "entered, unseeded",
 * which is what `program_event_entries.seed` stores for a player in a draw with
 * no seeding. Absent means the same thing on a fresh entry, but the two are
 * kept apart so an edit mode can state it.
 */
export interface TournamentEntrySeed {
  userId: string;
  /** One of `DRAWS`; anything else is ignored and the entry opens in the main draw. */
  draw?: string;
  seed?: number | null;
  /** The saved entry's id — see `FieldEntry.id`. Absent on a fresh seed. */
  id?: string;
  /** The saved entry's position — see `FieldEntry.position`. */
  position?: number;
  /** The saved entry's labels — see `FieldEntry.labels`. */
  labels?: string[];
  /** Settled, and how — see `FieldEntry.locked`. */
  locked?: "played" | "forfeited";
}

/**
 * The weekend and the field a caller can open the builder on.
 *
 * T20 hands one in; `NewTournamentFlow` passes none, and every absent field
 * falls back to exactly what a new tournament has always opened on — an unnamed
 * weekend, today on both dates, neutral, `3c`'s format, the program's
 * `default_surface`, and nobody in the field.
 *
 * The absent/stated distinction is `DualDraftSeed`'s, and matters in the same
 * two places: `surface: ""` is a coach saying "no surface" and is honoured as
 * none rather than falling back to the program's default, and `field: []` is an
 * empty field rather than an unstated one (they coincide today, and would not
 * if a later default ever seeded one).
 *
 * `format` is the option NAME (`EventFormatValue`), never a `"<bestOf>|<ad>"`
 * string and never a pair of loose numbers: `useTournamentDraft` resolves it to
 * the `FORMATS` row, which states `bestOf` and `adScoring` as literals. See
 * `TournamentFormat`'s header and `docs/ui-revamp-guardrails.md` §3.1 — there is
 * no encoding here to get wrong, and a seed cannot introduce one.
 */
export interface TournamentDraftSeed {
  /**
   * The event being edited. Its presence is what makes `submit()` call
   * `updateTournament` rather than `createTournament` — one fact, in one
   * place, rather than a `mode` flag the two halves could disagree about.
   */
  eventId?: string;
  name?: string;
  /** YYYY-MM-DD. */
  startsOn?: string;
  endsOn?: string;
  site?: EventSite;
  /** `""` is none, and is honoured as none. */
  surface?: string;
  format?: EventFormatValue;
  field?: TournamentEntrySeed[];
  /**
   * Saved entries the field step cannot draw, submitted back verbatim.
   *
   * The field is one row per ROSTER player, so a saved entry naming somebody
   * who has since left the program — or a doubles pair, which this screen has
   * no way to make — has no row to appear on. Dropping it from the submission
   * is not the harmless option: `planEntryChanges` would read the absence as a
   * delete, and either remove an entry nobody asked to remove or refuse the
   * whole save because that entry has a match. Sent back unchanged, the
   * planner sees no change and leaves the row alone.
   */
  carry?: TournamentEntryInput[];
}

/** The `FORMATS` row an option name names, or `3c`'s own. Never a parse. */
function formatFor(value: EventFormatValue | undefined): TournamentFormat {
  if (!value) return DEFAULT_FORMAT;
  return FORMATS.find((option) => option.value === value) ?? DEFAULT_FORMAT;
}

/**
 * The entered map a seed opens on, keyed the way every other read of it is.
 *
 * Filtered against the roster the screen actually draws: an id nobody on it
 * holds would be an entry with no row to edit or remove it from.
 */
export function seedEntries(
  roster: LadderPlayer[],
  field: TournamentEntrySeed[] | undefined,
): Map<string, FieldEntry> {
  const entered = new Map<string, FieldEntry>();
  if (!field) return entered;
  for (const row of field) {
    if (!roster.some((player) => player.userId === row.userId)) continue;
    entered.set(row.userId, {
      draw: row.draw && DRAWS.includes(row.draw) ? row.draw : MAIN_DRAW,
      // Back to the string the cell holds. `null` and absent are both "no
      // seed", which is the empty string — never a 0, which would print as an
      // actual seeding.
      seed: row.seed !== undefined && row.seed !== null ? String(row.seed) : "",
      id: row.id,
      position: row.position,
      labels: row.labels,
      locked: row.locked,
    });
  }
  return entered;
}

/**
 * The field the entered map draws — one `{ player, entry }` pair per roster
 * player who is in, in roster order. Pulled out of `useTournamentDraft` (a
 * mechanical extraction, no behaviour change) so `buildTournamentEntries`
 * below can be composed and tested without the hook.
 */
export function fieldFor(
  roster: LadderPlayer[],
  entered: ReadonlyMap<string, FieldEntry>,
  /**
   * The field's order as the coach arranged it, by `userId`. Absent reads as
   * roster order. Ids with no entry or no roster player are skipped, and an
   * entered player the order does not name follows in roster order — so a
   * stale order can drop nobody.
   */
  order?: readonly string[],
): { player: LadderPlayer; entry: FieldEntry }[] {
  const inRoster = roster.flatMap((player) => {
    const entry = entered.get(player.userId);
    return entry ? [{ player, entry }] : [];
  });
  if (!order) return inRoster;
  const byId = new Map(inRoster.map((row) => [row.player.userId, row]));
  const ordered = order.flatMap((id) => {
    const row = byId.get(id);
    if (!row) return [];
    byId.delete(id);
    return [row];
  });
  return [...ordered, ...byId.values()];
}

/**
 * The entries as `submit()` writes them — `carry` first and unchanged, then
 * the field in roster order. A NEW entry's `position` is the next number no
 * saved row already holds, taken in roster order; a LOADED entry keeps the
 * position it was saved with, because `planEntryChanges` refuses a settled
 * entry whose position moved. See `useTournamentDraft`'s `submit()` header.
 */
export function buildTournamentEntries(
  roster: LadderPlayer[],
  entered: ReadonlyMap<string, FieldEntry>,
  carry: TournamentEntryInput[],
  /** The field's arranged order — see `fieldFor`. Absent is roster order. */
  order?: readonly string[],
): TournamentEntryInput[] {
  const field = fieldFor(roster, entered, order);

  let nextPosition =
    Math.max(
      -1,
      ...carry.map((row) => row.position),
      ...field.map(({ entry }) => entry.position ?? -1),
    ) + 1;

  return [
    ...carry,
    ...field.map(({ player, entry }) => ({
      // The saved row this came from, where there is one. Without it
      // `planEntryChanges` matches on the `<draw> #<position>` label alone,
      // and an entry that moved draws would read as a delete and an insert.
      id: entry.id,
      // `3c` has one section and it is singles. A doubles pair is one entry
      // carrying two names, and this screen draws no way to make one.
      discipline: "singles" as const,
      position: entry.position ?? nextPosition++,
      draw: entry.draw,
      // "" is "nobody typed a seed", which is a null column — not a 0, which
      // would print as an actual seeding. Guarded on the number rather than
      // the string: `"0"` is truthy, and the column refuses it
      // (`check (seed is null or seed > 0)`). The cell already strips a
      // leading zero, so this is the second lock on the same door.
      seed: Number(entry.seed) > 0 ? Number(entry.seed) : null,
      playerUserIds: [player.userId],
      // The labels the row was SAVED with, where it was saved with any.
      // `player_labels` is written once and never re-derived, so re-deriving
      // one here would report a renamed roster player's untouched entry as
      // an edit — and refuse it, if that entry has been played.
      playerLabels: entry.labels ?? [player.name],
    })),
  ];
}

/**
 * A new tournament's draft: the weekend, who is in the field, and the write.
 *
 * A hook and not a component for `useDualDraft`'s reason — the draft is the one
 * thing the steps cannot each own. A field held inside the field step would be
 * thrown away every time the coach walked back to the dates, and a weekend step
 * that held the name would leave `submit()` with nothing to send. Nothing here
 * renders.
 */
export function useTournamentDraft(
  roster: LadderPlayer[],
  defaultSurface: string | null,
  initial?: TournamentDraftSeed,
) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  /** `createTournament`'s `ActionError`, held so the flow can print it. */
  const [error, setError] = useState<string | null>(null);
  const [entered, setEntered] = useState<ReadonlyMap<string, FieldEntry>>(() =>
    seedEntries(roster, initial?.field),
  );
  /**
   * The field's order, by `userId` — what the coach drags. Opens on the saved
   * field's own order (the seed's, which is the event's), and a player added
   * later joins at the bottom. New entries are numbered in this order; a
   * loaded entry keeps the position it was saved with (`buildTournamentEntries`).
   */
  const [order, setOrder] = useState<string[]>(() => [
    ...seedEntries(roster, initial?.field).keys(),
  ]);
  const [draft, setDraft] = useState<TournamentDraft>(() => ({
    name: initial?.name ?? "",
    // Both dates today, which is what the dormant form opened on: a tournament
    // that runs one day is the common case, and the coach moves the end date
    // when it does not.
    startsOn: initial?.startsOn ?? todayISO(),
    endsOn: initial?.endsOn ?? todayISO(),
    site: initial?.site ?? DEFAULT_SITE,
    format: formatFor(initial?.format),
    // The seed first — including `""`, which is a coach saying "no surface"
    // and not an absent answer — then the program's own default, then none.
    // Never "Hard": a court type nobody stated is a fact about the tournament
    // we would be inventing, and `createTournament` stores "" as a null column.
    surface:
      initial?.surface !== undefined ? initial.surface : (defaultSurface ?? ""),
  }));

  function edit(patch: Partial<TournamentDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  // The same array the field step walks, filtered — not a second list. Each
  // surviving element carries its own entry, so no row is ever paired with a
  // lookup that could return somebody else's. Its order is the order new
  // entries are numbered in, which is why ladder order is the order; an entry
  // loaded from a saved event keeps the position it already had. See
  // `submit()`.
  const field = fieldFor(roster, entered, order);

  function enter(player: LadderPlayer, draw: string = MAIN_DRAW) {
    setEntered((current) => {
      const existing = current.get(player.userId);
      // A settled entry's draw is not this screen's to move — the save would
      // refuse it, and refusal is total. The row draws no live control, so
      // this is the second lock on the same door.
      if (existing?.locked) return current;
      if (!existing) {
        setOrder((ids) =>
          ids.includes(player.userId) ? ids : [...ids, player.userId],
        );
      }
      const next = new Map(current);
      next.set(player.userId, {
        ...existing,
        draw,
        // A qualifier is not seeded, and the cell beside the draw says so with
        // a dash. Keeping a seed alive behind that dash would send a number
        // nobody could see.
        seed: draw === QUALIFYING ? "" : (existing?.seed ?? ""),
      });
      return next;
    });
  }

  function remove(player: LadderPlayer) {
    setEntered((current) => {
      // A settled entry cannot be dropped either: `planEntryChanges` refuses
      // to delete a row a match points at, and a refusal takes the whole save
      // with it.
      if (current.get(player.userId)?.locked) return current;
      setOrder((ids) => ids.filter((id) => id !== player.userId));
      const next = new Map(current);
      next.delete(player.userId);
      return next;
    });
  }

  /**
   * A drop: the field is exactly `ids`, in that order.
   *
   * Anyone newly in enters the main draw, anyone left out is removed — except
   * a settled entry, which can neither be dropped (`remove`'s rule) nor
   * dragged (its row draws no grip). One that `ids` omits anyway stays, at the
   * bottom, rather than vanishing from the order while still in the field.
   */
  function arrange(ids: readonly string[]) {
    setEntered((current) => {
      const next = new Map<string, FieldEntry>();
      for (const id of ids) {
        next.set(id, current.get(id) ?? { draw: MAIN_DRAW, seed: "" });
      }
      const kept: string[] = [];
      for (const [id, entry] of current) {
        if (!next.has(id) && entry.locked) {
          next.set(id, entry);
          kept.push(id);
        }
      }
      setOrder([...ids, ...kept]);
      return next;
    });
  }

  /**
   * Change one entered player's draw or seed, keyed by the id the map is keyed
   * by. Never by name and never by row index — the two keys that put "Seed 3"
   * under the wrong person the moment two rows share a surname, or a row above
   * is removed.
   */
  function amend(player: LadderPlayer, patch: Partial<FieldEntry>) {
    setEntered((current) => {
      const existing = current.get(player.userId);
      if (!existing || existing.locked) return current;
      const next = new Map(current);
      next.set(player.userId, { ...existing, ...patch });
      return next;
    });
  }

  /**
   * Write the tournament, then go to it.
   *
   * `bestOf` and `adScoring` are read off the chosen `FORMATS` row and travel
   * as themselves — there is no `"<bestOf>|<adScoring>"` string to decode, which
   * is the whole point of that table (see `TournamentFormat`). `adScoring` is a
   * real boolean here and a real boolean in the `format` jsonb the action
   * writes, which is what `docs/ui-revamp-guardrails.md` §3.1 and §4 require of
   * every event a video is later submitted against.
   *
   * A NEW entry's `position` is the next number no saved row holds, taken in
   * roster order — so a field typed from scratch is numbered 0..n in ladder
   * order. A LOADED entry keeps the position it was saved with, because
   * `planEntryChanges` compares `position` and refuses a settled entry whose
   * value moved: renumbering the field around a newly entered player would
   * turn "enter one more player" into "somebody else's played match is in the
   * way".
   *
   * On an edit — a seed carrying an `eventId` — this calls `updateTournament`
   * instead, which is `createTournament` plus `planEntryChanges` over the rows
   * already saved. Same footer, same `ActionError`.
   */
  function submit() {
    setError(null);

    // Entries the field step cannot draw, first and unchanged — see
    // `TournamentDraftSeed.carry`.
    const carried = initial?.carry ?? [];
    const entries: TournamentEntryInput[] = buildTournamentEntries(
      roster,
      entered,
      carried,
      order,
    );

    const eventId = initial?.eventId;

    startTransition(async () => {
      const payload = {
        name: draft.name,
        startsOn: draft.startsOn,
        endsOn: draft.endsOn,
        site: draft.site,
        surface: draft.surface,
        // No Hosted-by cell on this screen, and a host nobody entered is a
        // fact about the weekend we would be inventing.
        host: null,
        bestOf: draft.format.bestOf,
        adScoring: draft.format.adScoring,
        entries,
      };

      const result = eventId
        ? await updateTournament({ eventId, ...payload })
        : await createTournament(payload);

      if ("error" in result) {
        // The action's own sentence, on screen. A refusal that only turned the
        // button off would leave a coach re-clicking a form that had already
        // told us why it could not save.
        setError(result.error);
        return;
      }

      router.push(`/dashboard/team/schedule/${result.eventId}`);
    });
  }

  return {
    draft,
    edit,
    entered,
    enter,
    remove,
    amend,
    arrange,
    order,
    field,
    submit,
    pending,
    error,
  };
}

/**
 * Step one: the tournament's name, alone.
 *
 * On a step of its own, the way the dual asks for its school before anything
 * else — a name is what the schedule and every entry refer to the weekend by,
 * and `createTournament` refuses a tournament without one.
 *
 * A body, not a screen — `new-tournament-flow.tsx` puts it under the shell's
 * title and lede, and owns the footer that gates on it.
 */
export function TournamentNameStep({
  draft,
  onEdit,
  onSubmit,
}: {
  draft: TournamentDraft;
  onEdit: (patch: Partial<TournamentDraft>) => void;
  /** Enter in the field — the flow's Continue, when it would wake. */
  onSubmit: () => void;
}) {
  return (
    <label className="block">
      <span className="eyebrow">Tournament · name</span>
      {/* The 2px rule turns blue on focus and is the focus mark, so the input
          opts out of the ring inside it (`styles/design-system/focus.css`).
          The placeholder is the name `3c` drew filled in: an unnamed
          tournament is what the screen actually opens on. */}
      <span className="mt-1 flex items-center border-b-2 border-[var(--border-medium)] pt-1.5 pb-2 transition-colors focus-within:border-[var(--blue)]">
        <input
          autoFocus
          value={draft.name}
          onChange={(event) => onEdit({ name: event.target.value })}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            onSubmit();
          }}
          placeholder="Buckeye Fall Classic"
          data-focus-ring="none"
          className="text-title-lg w-full bg-transparent outline-none placeholder:text-[var(--ink-300)]"
        />
      </span>
    </label>
  );
}

/**
 * Step two: both dates, the site and the format — `DualFactsStep`'s four-up,
 * with Ends where the dual has Surface.
 *
 * Site and Format are the dual's `MenuSelect` underline cells, format words
 * and all, so the two builders' second steps are one row of controls.
 */
export function TournamentDetailsStep({
  draft,
  onEdit,
}: {
  draft: TournamentDraft;
  onEdit: (patch: Partial<TournamentDraft>) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-6">
      <FieldCell label="Starts">
        <DateField
          label="Starts"
          variant="bare"
          value={draft.startsOn}
          onChange={(startsOn) => onEdit({ startsOn })}
          className="w-full"
        />
      </FieldCell>
      <FieldCell label="Ends">
        <DateField
          label="Ends"
          variant="bare"
          value={draft.endsOn}
          onChange={(endsOn) => onEdit({ endsOn })}
          // A weekend cannot end before it starts. `undefined` while Starts
          // is empty — `""` would be parsed as a bound and thrown away, and
          // an empty Starts constrains nothing.
          min={draft.startsOn || undefined}
          className="w-full"
        />
      </FieldCell>
      <FieldCell label="Site" chrome="none">
        <MenuSelect
          label="Site"
          variant="underline"
          value={draft.site}
          options={SITES}
          onChange={(site) => onEdit({ site })}
        />
      </FieldCell>
      <FieldCell label="Format" chrome="none" note={draft.format.scoring}>
        <MenuSelect
          label="Format"
          variant="underline"
          value={draft.format.value}
          options={FORMAT_OPTIONS}
          onChange={(value) => {
            // The chosen ROW, looked up by option name — never a parse of the
            // option's text. This is `format`'s only assignment, and every row
            // of that table states `adScoring` as a literal boolean. See
            // `TournamentFormat` and `docs/ui-revamp-guardrails.md` §3.1.
            const chosen = FORMATS.find((option) => option.value === value);
            if (chosen) onEdit({ format: chosen });
          }}
        />
      </FieldCell>
    </div>
  );
}

/**
 * The field: two tables on the page — Entries, then the Roster.
 *
 * ── Two tables ─────────────────────────────────────────────────────────────
 * Entries is who is playing: each row a player with the draw and seed that
 * belong to an entry. Roster is everyone on the team not entered yet, with an
 * Add on each row and Add all in its heading. No cards — the wizard is flat,
 * so each table is a heading over hairline rows — and no boxed controls: Draw
 * is a `MenuSelect` in its `text` form and Seed is click-to-edit text, so a
 * row is the lineup's 44px rather than a form field's height. The words are
 * the app's own: "Player" (the roster table, a dual's detail), "Entries" (the
 * event drawer, and the footer's "Creates N entries").
 *
 * Both tables share their first two tracks — the grip and Player — so the
 * columns line up across the gap.
 *
 * ── Dragging ───────────────────────────────────────────────────────────────
 * The lineup's gesture, on the same `singles-order.ts` arithmetic: one
 * `Reorder.Group` over the entries' ids, the `BENCH` marker (drawn as the
 * Roster table's heading) and the roster's ids. A row moves by its grip —
 * never by the row, so the draw menu and seed stay clickable — within Entries
 * to order it, or between the tables to enter or remove; a drop is one
 * `onArrange` with the ids above the marker. The keyboard lift is the
 * lineup's: Space or Enter on a grip lifts, arrows move, Space drops, Escape
 * puts it back. A settled row draws no grip; it cannot leave, and the save
 * would refuse a moved position.
 *
 * Add enters the main draw at the bottom of Entries — the answer for almost
 * every entry — and the roster stays in ladder order. The seed exists only on
 * an entry: a number typed against nobody would have to be thrown away. A
 * qualifier holds no seed.
 */
export function TournamentFieldStep({
  roster,
  entered,
  order,
  onEnter,
  onRemove,
  onAmend,
  onArrange,
}: {
  roster: LadderPlayer[];
  entered: ReadonlyMap<string, FieldEntry>;
  /** The entries' order by `userId` — `useTournamentDraft().order`. */
  order: readonly string[];
  onEnter: (player: LadderPlayer, draw: string) => void;
  onRemove: (player: LadderPlayer) => void;
  onAmend: (player: LadderPlayer, patch: Partial<FieldEntry>) => void;
  /** A drop: the entries are exactly these ids, in this order. */
  onArrange: (ids: readonly string[]) => void;
}) {
  const reduceMotion = useReducedMotion();
  const listRef = useRef<HTMLDivElement>(null);

  const players = useMemo(
    () => new Map(roster.map((player) => [player.userId, player])),
    [roster],
  );
  const fieldIds = fieldFor(roster, entered, order).map(
    ({ player }) => player.userId,
  );
  const benchIds = roster
    .filter((player) => !entered.has(player.userId))
    .map((player) => player.userId);
  const resting = [...fieldIds, BENCH, ...benchIds];

  /** The order being edited — a drag or a keyboard lift — or null at rest. */
  const [draft, setDraft] = useState<string[] | null>(null);
  const draftRef = useRef<string[] | null>(null);
  const [lifted, setLifted] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const sequence = draft ?? resting;
  const benchAt = sequence.indexOf(BENCH);

  function setDraftSeq(next: string[] | null) {
    draftRef.current = next;
    setDraft(next);
  }

  function where(seq: readonly string[], id: string): string {
    const at = seq.indexOf(id);
    const bar = seq.indexOf(BENCH);
    return at < bar ? `entry ${at + 1} of ${bar}` : "on the roster";
  }

  function nameOf(id: string): string {
    return players.get(id)?.name ?? "Player";
  }

  function commit(seq: readonly string[]) {
    setDraftSeq(null);
    onArrange(aboveBench(seq));
  }

  function focusGrip(id: string) {
    requestAnimationFrame(() =>
      document.getElementById(fieldGripId(id))?.focus(),
    );
  }

  function lift(id: string) {
    setDraftSeq(resting);
    setLifted(id);
    setAnnouncement(
      `${nameOf(id)} lifted, ${where(resting, id)}. Arrows move, Space drops, Escape cancels.`,
    );
  }

  function drop(id: string) {
    const seq = draftRef.current ?? resting;
    setLifted(null);
    commit(seq);
    setAnnouncement(`${nameOf(id)} dropped, ${where(seq, id)}.`);
    focusGrip(id);
  }

  function cancel(id: string) {
    setLifted(null);
    setDraftSeq(null);
    setAnnouncement(`${nameOf(id)} put back.`);
    focusGrip(id);
  }

  function step(id: string, direction: 1 | -1) {
    const seq = moveToken(draftRef.current ?? resting, id, direction);
    setDraftSeq(seq);
    setAnnouncement(`${nameOf(id)}, ${where(seq, id)}.`);
    focusGrip(id);
  }

  // A lift abandoned by tabbing away is put back rather than half-applied.
  useEffect(() => {
    if (!lifted) return;
    function onFocusIn(event: FocusEvent) {
      if ((event.target as HTMLElement | null)?.id !== fieldGripId(lifted!)) {
        setLifted(null);
        setDraftSeq(null);
      }
    }
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [lifted]);

  if (roster.length === 0) {
    return (
      <p className="text-micro" style={{ color: "var(--ink-500)" }}>
        No players on the roster yet.
      </p>
    );
  }

  const held = lifted ?? dragging;
  const seeded = fieldIds.filter((id) => {
    const entry = entered.get(id);
    return (
      entry !== undefined && entry.draw !== QUALIFYING && entry.seed !== ""
    );
  }).length;
  const benchPlayers = benchIds.flatMap((id) => {
    const player = players.get(id);
    return player ? [player] : [];
  });
  const rosterCount = sequence.length - 1 - benchAt;

  return (
    <div>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <TableHeading
        title="Entries"
        meta={`${fieldIds.length} ${fieldIds.length === 1 ? "entry" : "entries"} · ${seeded} seeded`}
      />
      <ColumnHeads
        grid={ENTRY_GRID}
        labels={["", "Player", "Draw", "Seed", ""]}
      />

      <Reorder.Group
        ref={listRef}
        as="div"
        axis="y"
        values={sequence}
        onReorder={(next) => setDraftSeq(next)}
        className="flex flex-col"
      >
        {sequence.map((id, index) => {
          if (id === BENCH) {
            return (
              <Reorder.Item
                key={BENCH}
                as="div"
                value={BENCH}
                dragListener={false}
                layout="position"
                transition={reduceMotion ? { duration: 0 } : ROW_SLIDE}
                className="select-none"
              >
                {index === 0 && !held ? (
                  <p
                    className="flex h-11 items-center border-b border-[var(--border-hairline)] text-[12px]"
                    style={{ color: "var(--ink-500)" }}
                  >
                    No entries yet — add players from the roster below.
                  </p>
                ) : null}
                <div className="pt-12">
                  <TableHeading
                    title="Roster"
                    meta={`${rosterCount} ${rosterCount === 1 ? "player" : "players"}`}
                    action={
                      benchPlayers.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => {
                            for (const player of benchPlayers) {
                              onEnter(player, MAIN_DRAW);
                            }
                          }}
                          className="flex cursor-pointer items-center gap-1 text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
                        >
                          <Plus
                            className="size-[11px]"
                            strokeWidth={2}
                            aria-hidden="true"
                          />
                          Add all
                        </button>
                      ) : null
                    }
                  />
                  <ColumnHeads grid={ROSTER_GRID} labels={["", "Player", ""]} />
                  {index === sequence.length - 1 ? (
                    <p
                      className="flex h-10 items-center text-[12px]"
                      style={{ color: "var(--ink-500)" }}
                    >
                      Everyone on the roster is entered.
                    </p>
                  ) : null}
                </div>
              </Reorder.Item>
            );
          }

          const player = players.get(id);
          if (!player) return null;
          const inField = index < benchAt;
          // Mid-drag a roster player above the marker has no entry yet; it is
          // drawn as an entry in the main draw until the drop makes it one.
          const entry = entered.get(id) ?? { draw: MAIN_DRAW, seed: "" };
          return (
            <FieldItem
              key={id}
              id={id}
              name={player.name}
              inField={inField}
              last={
                inField ? index === benchAt - 1 : index === sequence.length - 1
              }
              locked={entered.get(id)?.locked !== undefined}
              held={held === id}
              reduceMotion={Boolean(reduceMotion)}
              listRef={listRef}
              onDragStart={() => {
                setDragging(id);
                setDraftSeq(resting);
              }}
              onDragEnd={() => {
                setDragging(null);
                commit(draftRef.current ?? resting);
              }}
              onKey={(event) => {
                if (event.key === " " || event.key === "Enter") {
                  event.preventDefault();
                  event.stopPropagation();
                  if (lifted === id) drop(id);
                  else lift(id);
                  return;
                }
                if (lifted !== id) return;
                if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                  event.preventDefault();
                  event.stopPropagation();
                  step(id, event.key === "ArrowDown" ? 1 : -1);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  cancel(id);
                }
              }}
            >
              {(grip) =>
                inField ? (
                  <FieldRow
                    grip={grip}
                    player={player}
                    entry={entry}
                    onDraw={(draw) => onEnter(player, draw)}
                    onRemove={() => onRemove(player)}
                    onAmend={(patch) => onAmend(player, patch)}
                  />
                ) : (
                  <BenchRow
                    grip={grip}
                    player={player}
                    onAdd={() => onEnter(player, MAIN_DRAW)}
                  />
                )
              }
            </FieldItem>
          );
        })}
      </Reorder.Group>
    </div>
  );
}

/**
 * The two tables' tracks. The first two — the grip's 16px and Player — are
 * shared, which is what lines the Player column up across both tables.
 */
// Every track after Player is FIXED: an `auto` last track sized to the
// rows' × button and to the header's empty cell differently, and pushed the
// Draw and Seed labels 17px off their values. 64px holds "Forfeited".
const ENTRY_GRID = "grid-cols-[16px_minmax(0,1fr)_140px_80px_64px]";
const ROSTER_GRID = "grid-cols-[16px_minmax(0,1fr)_auto]";

const fieldGripId = (userId: string) => `field-grip-${userId}`;

/** The lineup's settle and slide — see `lineup-rows.tsx`. No bounce. */
const ROW_SETTLE = { bounceStiffness: 600, bounceDamping: 50 };
const ROW_SLIDE = { duration: 0.22, ease: [0.23, 1, 0.32, 1] as const };

/**
 * A table's heading: its name as an eyebrow, a count beside it, an optional
 * action at the end.
 *
 * 16px of space below it, before the column labels: sat directly on them, the
 * table's name and its columns' names read as one block of small capitals.
 */
function TableHeading({
  title,
  meta,
  action,
}: {
  title: string;
  meta: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex h-5 items-center justify-between">
      <span className="flex items-baseline gap-2.5">
        <span className="eyebrow">{title}</span>
        <span className="tabular text-[11px] text-[var(--ink-500)]">
          {meta}
        </span>
      </span>
      {action}
    </div>
  );
}

/** Eyebrow column labels over a hairline, on a table's own grid. */
function ColumnHeads({ grid, labels }: { grid: string; labels: string[] }) {
  return (
    <div
      className={cn(
        "grid items-center gap-3.5 border-b border-[var(--border-hairline)] pb-2",
        grid,
      )}
    >
      {labels.map((label, index) => (
        <span key={`${label}-${index}`} className="eyebrow-sm">
          {label}
        </span>
      ))}
    </div>
  );
}

/**
 * One draggable row: the grip, then the entry or roster row.
 *
 * Only the grip starts a drag (`dragListener={false}`), so the draw menu, the
 * seed and Add/Remove keep their clicks. The grip is the grid's first track —
 * drawn on every row, entries and roster alike, so both tables' Player column
 * starts at the same x; a settled entry draws the track empty.
 */
function FieldItem({
  id,
  name,
  inField,
  last,
  locked,
  held,
  reduceMotion,
  listRef,
  onDragStart,
  onDragEnd,
  onKey,
  children,
}: {
  id: string;
  name: string;
  inField: boolean;
  last: boolean;
  locked: boolean;
  held: boolean;
  reduceMotion: boolean;
  listRef: React.RefObject<HTMLDivElement | null>;
  onDragStart: () => void;
  onDragEnd: () => void;
  onKey: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  children: (grip: React.ReactNode) => React.ReactNode;
}) {
  const controls = useDragControls();
  const grip = locked ? (
    <span aria-hidden="true" />
  ) : (
    <button
      id={fieldGripId(id)}
      type="button"
      aria-label={`Move ${name}, ${inField ? "in entries" : "on the roster"}`}
      aria-pressed={held}
      onPointerDown={(event) => {
        event.currentTarget.focus({ preventScroll: true });
        controls.start(event);
      }}
      onKeyDown={onKey}
      className={cn(
        "-ml-0.5 inline-flex h-7 w-5 cursor-grab touch-none items-center justify-center rounded-[5px] transition-colors duration-[var(--duration-hover)] active:cursor-grabbing",
        "focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
        held
          ? "text-[var(--ink-900)]"
          : "text-[var(--ink-300)] group-hover:text-[var(--ink-600)]",
      )}
    >
      <GripVertical className="size-3.5" strokeWidth={1.5} aria-hidden />
    </button>
  );
  return (
    <Reorder.Item
      as="div"
      value={id}
      dragListener={false}
      dragControls={controls}
      dragConstraints={listRef}
      dragElastic={0.08}
      dragTransition={ROW_SETTLE}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      layout="position"
      transition={{ layout: reduceMotion ? { duration: 0 } : ROW_SLIDE }}
      className={cn(
        // A hairline under each row but a table's last, and on hover the
        // lineup's wash with an 8px radius — rounded ONLY while lit, with the
        // hairline gone, because a radius on a resting row curls its hairline
        // up at both ends (`lineup-rows.tsx`, LIT). `-mx-2 px-2` gives the
        // rounded wash room past the text.
        "group relative -mx-2 bg-[var(--surface-card)] px-2 transition-[background-color,box-shadow] duration-[var(--duration-hover)] hover:rounded-[8px] hover:border-transparent hover:bg-[var(--surface-subtle)]",
        !last && "border-b border-[var(--border-hairline)]",
        held &&
          "z-[3]! rounded-[8px] border-transparent shadow-[0_0_0_2px_var(--blue),var(--shadow-card-emphasis)]!",
      )}
    >
      {children(grip)}
    </Reorder.Item>
  );
}

/**
 * One entry: grip, player, draw, seed, and the way back out.
 *
 * The name is NOT editable, which is the deleted entry list's rule and the
 * reason it exists: retyping a name over an entry that already carries a
 * roster id is how a match gets attributed to the wrong athlete.
 *
 * A settled entry — one with a match or a forfeit — is drawn in place with
 * nothing on it a save could move: the draw menu is disabled, the seed is
 * text, and the remove control is replaced by `Played`/`Forfeited`. See
 * `FieldEntry.locked`.
 */
function FieldRow({
  grip,
  player,
  entry,
  onDraw,
  onRemove,
  onAmend,
}: {
  grip: React.ReactNode;
  player: LadderPlayer;
  entry: FieldEntry;
  onDraw: (draw: string) => void;
  onRemove: () => void;
  onAmend: (patch: Partial<FieldEntry>) => void;
}) {
  const [editingSeed, setEditingSeed] = useState(false);

  const name = player.name;
  const locked = entry.locked;
  const qualifying = entry.draw === QUALIFYING;
  const seeded = !qualifying && entry.seed !== "";

  return (
    <div className={cn("grid h-11 items-center gap-3.5", ENTRY_GRID)}>
      {grip}

      <span className="flex min-w-0 items-center gap-2.5">
        <InitialsAvatar name={name} />
        <span className="truncate text-[13px] font-medium text-[var(--ink-900)]">
          {name}
        </span>
      </span>

      <MenuSelect
        label={`Draw for ${name}`}
        variant="text"
        value={entry.draw}
        options={DRAW_MENU_OPTIONS}
        onChange={(draw) => onDraw(draw)}
        disabled={locked !== undefined}
        align="start"
        width={260}
      />

      {locked || qualifying ? (
        // Read-only on a settled entry, and NOT because the seed is
        // uninteresting: `changed()` in `entry-plan.ts` compares `seed` on a
        // tournament row, so a settled entry whose seed moved is one the save
        // refuses — and a refusal is total. A qualifier holds no seed.
        <span
          className="mono tabular text-[12px]"
          style={{ color: seeded ? "var(--ink-600)" : "var(--ink-400)" }}
        >
          {seeded ? entry.seed : "—"}
        </span>
      ) : editingSeed ? (
        <input
          autoFocus
          value={entry.seed}
          inputMode="numeric"
          placeholder="Seed"
          aria-label={`Seed for ${name}`}
          // Digits only, filtered on the way in rather than validated on the
          // way out — `Number("3rd")` is `NaN`, and a NaN seed reaches the
          // column as a write that fails long after the coach typed it.
          //
          // A leading zero goes the same way: the column is
          // `check (seed is null or seed > 0)`, so "0" is a value the database
          // refuses. Four digits is past any real draw and keeps `Number()`
          // inside `integer`.
          onChange={(event) =>
            onAmend({
              seed: event.target.value
                .replace(/[^0-9]/g, "")
                .replace(/^0+/, "")
                .slice(0, 4),
            })
          }
          onBlur={() => setEditingSeed(false)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "Escape") {
              event.currentTarget.blur();
            }
          }}
          // The blue rule under the text is the focus mark (`focus.css`).
          data-focus-ring="none"
          className="mono tabular h-7 w-12 border-b border-[var(--blue)] bg-transparent text-[12px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-300)]"
        />
      ) : (
        <button
          type="button"
          aria-label={`Seed for ${name}`}
          onClick={() => setEditingSeed(true)}
          className={cn(
            "w-fit cursor-pointer border-b border-dotted border-[var(--ink-300)] text-left text-[12px] transition-colors duration-[var(--duration-hover)] hover:border-[var(--ink-600)]",
            seeded
              ? "mono tabular text-[var(--ink-900)]"
              : "text-[var(--ink-400)]",
          )}
        >
          {seeded ? entry.seed : "Add seed"}
        </button>
      )}

      {locked ? (
        <span className="text-micro flex items-center justify-end gap-1 text-[var(--ink-500)]">
          <LockKeyhole
            className="size-3.5"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          {locked === "forfeited" ? "Forfeited" : "Played"}
        </span>
      ) : (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name} from tournament`}
          className="inline-flex size-[26px] cursor-pointer items-center justify-center justify-self-end rounded-[6px] text-[var(--ink-400)] transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-card)] hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
        >
          <X className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** One roster player not entered, and the Add that enters them. */
function BenchRow({
  grip,
  player,
  onAdd,
}: {
  grip: React.ReactNode;
  player: LadderPlayer;
  onAdd: () => void;
}) {
  return (
    <div className={cn("grid h-10 items-center gap-3.5", ROSTER_GRID)}>
      {grip}
      <span className="flex min-w-0 items-center gap-2.5">
        <InitialsAvatar name={player.name} />
        <span className="truncate text-[13px] text-[var(--ink-700)]">
          {player.name}
        </span>
      </span>
      {/* Grey until pointed at: a blue Add on every roster row would be a
          column of calls to action beside the footer's own. Add all, in the
          heading, is the table's one blue word. */}
      <button
        type="button"
        onClick={onAdd}
        aria-label={`Add ${player.name} to tournament`}
        className="flex cursor-pointer items-center gap-1 rounded-[5px] px-1 py-1 text-[11px] font-medium text-[var(--ink-600)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
      >
        <Plus className="size-[11px]" strokeWidth={2} aria-hidden="true" />
        Add
      </button>
    </div>
  );
}
/**
 * One row of the Format control: the option it is, and what it means.
 *
 * ── Why this is a table and not an encoding ────────────────────────────────
 * The dormant forms carried the format through a `<select>` as the string
 * `"<bestOf>|<adScoring>"` and decoded it with `format.split("|")` →
 * `Number(bestOf)` and `adScoring === "true"`. That round trip is where the
 * outage lived: `adScoring` is `boolean | null` on `EventFormat`, a null
 * interpolates into that string as the four characters `null`, and
 * `=== "true"` reads those as a confident `false` — a wrong answer that looks
 * like a real one. What that produced, recorded in the deleted file's header
 * and in `lib/schedule/actions.ts`'s `CreateTournamentInput`: format arrived as
 * `{}`, `adScoring` arrived null, and every tournament video failed vendor
 * submission long after the coach had left. See
 * `docs/ui-revamp-guardrails.md` §3.1 and §4.
 *
 * So there is no encoding to get wrong here. `value` is an opaque option name
 * that is only ever compared, never parsed; `bestOf` and `adScoring` are stated
 * as literals in `FORMATS` below and travel as themselves. `adScoring` is typed
 * `boolean` rather than `EventFormat`'s `boolean | null`, which is what makes
 * "the control carries a real boolean" a compile error to break rather than a
 * convention to remember: no null can be assigned into this shape, so none can
 * reach `createTournament`, whose own input types it `boolean` for the same
 * reason.
 */
type TournamentFormat = DualFormat;

/**
 * The dual builder's format rows and words, drawn the same way: the trigger
 * prints the sets half and the scoring half sits under the cell. One table for
 * both builders, so the two cannot word a format differently — and the pair
 * that reaches the database is `EVENT_FORMATS`' either way.
 */
const FORMAT_OPTIONS = formatOptions(FORMATS);

/** What `3c` draws in the Format cell: best of 3, ad scoring. */
const DEFAULT_FORMAT =
  FORMATS.find((format) => format.value === "bo3-ad") ?? FORMATS[0];

/** What `3c` draws in the Site cell, and the usual answer for a tournament. */
const DEFAULT_SITE: EventSite = "neutral";

/** The first of `DRAWS` — a stored value, not a label. */
const MAIN_DRAW = "Main draw";

/** The other one. `3c` draws it on Rafael Osei's row. */
const QUALIFYING = "Qualifying";

/**
 * Where an entry can start, and nowhere else.
 *
 * These two strings are the deleted `entry-editor.tsx`'s `DRAWS`, ported
 * verbatim rather than reworded. They are STORED values — they land in
 * `program_event_entries.draw` and come back out as themselves — so an entry
 * this screen writes has to be spelled the way every entry that pair wrote is
 * spelled, or the same draw reads as two.
 *
 * Consolation and the flights are not offered, for that file's own reason: they
 * are not places a coach enters anyone. A player arrives in consolation by
 * losing, and that move is recorded per result on the event page. Offering them
 * at creation would let a weekend be described before it happened.
 */
const DRAWS: readonly string[] = [MAIN_DRAW, QUALIFYING];

/**
 * The two supported stored values, with the decision each one represents.
 * `MenuSelect` can carry this second line; a native option cannot.
 */
const DRAW_MENU_OPTIONS: readonly MenuOption<string>[] = [
  {
    value: MAIN_DRAW,
    label: MAIN_DRAW,
    description: "The athlete starts in the tournament's main bracket.",
  },
  {
    value: QUALIFYING,
    label: QUALIFYING,
    description: "The athlete must qualify before entering the main bracket.",
  },
];
