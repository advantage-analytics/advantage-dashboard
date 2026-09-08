"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { DateField } from "@/components/ui/date-field";
import {
  createTournament,
  updateTournament,
  type TournamentEntryInput,
} from "@/lib/schedule/actions";
import type { LadderPlayer } from "@/lib/data/roster-server";
import type { EventSite } from "@/lib/schedule/types";
import {
  EVENT_FORMATS,
  todayISO,
  type EventFormatValue,
} from "@/lib/schedule/format";

/**
 * `3c`, taken apart: the tournament draft, the weekend, and the field.
 *
 * ── What this file is now ──────────────────────────────────────────────────
 * Three exports and no screen. `useTournamentDraft` holds the draft and owns
 * the write; `TournamentWeekendStep` draws the five facts; `TournamentFieldStep`
 * draws the roster and who is in the field. `new-tournament-flow.tsx` frames
 * the two bodies as two steps of `WizardShell`, the same chrome
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
  field: TournamentEntrySeed[] | undefined
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
      seed:
        row.seed !== undefined && row.seed !== null ? String(row.seed) : "",
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
  entered: ReadonlyMap<string, FieldEntry>
): { player: LadderPlayer; entry: FieldEntry }[] {
  return roster.flatMap((player) => {
    const entry = entered.get(player.userId);
    return entry ? [{ player, entry }] : [];
  });
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
  carry: TournamentEntryInput[]
): TournamentEntryInput[] {
  const field = fieldFor(roster, entered);

  let nextPosition =
    Math.max(
      -1,
      ...carry.map((row) => row.position),
      ...field.map(({ entry }) => entry.position ?? -1)
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
  initial?: TournamentDraftSeed
) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  /** `createTournament`'s `ActionError`, held so the flow can print it. */
  const [error, setError] = useState<string | null>(null);
  const [entered, setEntered] = useState<ReadonlyMap<string, FieldEntry>>(() =>
    seedEntries(roster, initial?.field)
  );
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
      initial?.surface !== undefined ? initial.surface : defaultSurface ?? "",
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
  const field = fieldFor(roster, entered);

  function enter(player: LadderPlayer, draw: string = MAIN_DRAW) {
    setEntered((current) => {
      const existing = current.get(player.userId);
      // A settled entry's draw is not this screen's to move — the save would
      // refuse it, and refusal is total. The row draws no live control, so
      // this is the second lock on the same door.
      if (existing?.locked) return current;
      const next = new Map(current);
      next.set(player.userId, {
        ...existing,
        draw,
        // A qualifier is not seeded, and the cell beside the draw says so with
        // a dash. Keeping a seed alive behind that dash would send a number
        // nobody could see.
        seed: draw === QUALIFYING ? "" : existing?.seed ?? "",
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
      const next = new Map(current);
      next.delete(player.userId);
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
      carried
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
    field,
    submit,
    pending,
    error,
  };
}

/**
 * The weekend: the name, both dates, the site and the format.
 *
 * A body, not a screen — `new-tournament-flow.tsx` puts it under the shell's
 * title and lede, and owns the footer that gates on it.
 */
export function TournamentWeekendStep({
  draft,
  onEdit,
}: {
  draft: TournamentDraft;
  onEdit: (patch: Partial<TournamentDraft>) => void;
}) {
  return (
    <div>
      <label className="block">
        <span className="eyebrow">Tournament · name</span>
        {/* The 2px blue rule is the artboard's. What `3c` draws filled in is
            this field's placeholder: an unnamed tournament is what the screen
            actually opens on, and `createTournament` refuses one. */}
        <span className="mt-1 flex items-center border-b-2 border-[var(--border-medium)] pb-2 pt-1.5 transition-colors focus-within:border-[var(--blue)]">
          <input
            autoFocus
            value={draft.name}
            onChange={(event) => onEdit({ name: event.target.value })}
            placeholder="Buckeye Fall Classic"
            /* The span above turns its 2px rule blue on focus, and THAT is
               the focus mark — so a ring inset inside it would be a second one.
               The rule has to change, not merely be blue: drawn standing blue
               (as it was) plus this opt-out left the field with no focus
               indicator at all. `autoFocus` keeps the artboard's blue-on-arrival
               look. */
            data-focus-ring="none"
            className="w-full bg-transparent text-[22px] font-light tracking-[-0.4px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-300)]"
          />
        </span>
      </label>

      {/* `repeat(4, 1fr)`, `gap:24px`, `margin-top:16px` — the artboard's. */}
      <div className="mt-4 grid grid-cols-4 gap-6">
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
        <FieldCell label="Site">
          <FieldSelect
            label="Site"
            value={draft.site}
            options={SITES}
            onChange={(value) => {
              const chosen = SITES.find((option) => option.value === value);
              if (chosen) onEdit({ site: chosen.value });
            }}
          />
        </FieldCell>
        <FieldCell label="Format">
          <FieldSelect
            label="Format"
            value={draft.format.value}
            options={FORMATS}
            onChange={(value) => {
              // The chosen ROW, not a parse of the chosen string. See
              // `FORMATS` — this is the only assignment `format` has, and
              // every row of that table states `adScoring` as a literal
              // boolean.
              const chosen = FORMATS.find((option) => option.value === value);
              if (chosen) onEdit({ format: chosen });
            }}
          />
        </FieldCell>
      </div>
    </div>
  );
}

/**
 * The field: the roster, top to bottom, and where each player starts.
 *
 * ── One list ───────────────────────────────────────────────────────────────
 * Every row is a roster player and every row is answerable, so entering
 * somebody is picking their draw rather than clicking a `+` and then finding
 * their row again in a second table. `—` takes them back out. That is the whole
 * control surface: no rail, no add button, no entries list under it.
 *
 * The seed cell exists only once a player is in — an unentered row has no entry
 * to hold a seed, and a number typed against nobody would have to be thrown
 * away — and a qualifier's cell reads as a dash, because a qualifier holds no
 * seed.
 */
export function TournamentFieldStep({
  roster,
  entered,
  onEnter,
  onRemove,
  onAmend,
}: {
  roster: LadderPlayer[];
  entered: ReadonlyMap<string, FieldEntry>;
  onEnter: (player: LadderPlayer, draw: string) => void;
  onRemove: (player: LadderPlayer) => void;
  onAmend: (player: LadderPlayer, patch: Partial<FieldEntry>) => void;
}) {
  return (
    <div>
      <div className="flex flex-col">
        {roster.map((player, index) => (
          <FieldRow
            key={player.userId}
            player={player}
            entry={entered.get(player.userId)}
            last={index === roster.length - 1}
            onDraw={(draw) => {
              if (draw === "") {
                onRemove(player);
                return;
              }
              onEnter(player, draw);
            }}
            onAmend={(patch) => onAmend(player, patch)}
          />
        ))}
      </div>

      {roster.length === 0 ? (
        <p className="text-micro py-3" style={{ color: "var(--ink-500)" }}>
          No players on the roster yet.
        </p>
      ) : null}

      <p className="text-micro mt-2.5" style={{ color: "var(--ink-500)" }}>
        An entry is a player in a draw — where they start, not what they&#39;ll
        play.
      </p>
    </div>
  );
}

/**
 * One roster line: their ladder spot, their name, their draw, and their seed.
 *
 * 52px, hairline-separated. The name is NOT editable, which is the deleted
 * entry list's rule and the reason it exists: retyping a name over an entry
 * that already carries a roster id is how a match gets attributed to the wrong
 * athlete. A correction is a different row's draw, never an edit that silently
 * keeps the old id.
 *
 * A settled row — one whose entry has a match or a forfeit — is drawn in place
 * with nothing on it a save could move: the draw select is disabled beside a
 * `Played` micro, and the seed is a label rather than a field. See
 * `FieldEntry.locked`.
 */
function FieldRow({
  player,
  entry,
  last,
  onDraw,
  onAmend,
}: {
  player: LadderPlayer;
  entry: FieldEntry | undefined;
  last: boolean;
  onDraw: (draw: string) => void;
  onAmend: (patch: Partial<FieldEntry>) => void;
}) {
  const [editingSeed, setEditingSeed] = useState(false);

  const name = player.name;
  // Settled: a match points at this entry, or a side forfeited it. The row is
  // then drawn in place and read-only — see `FieldEntry.locked`, and the seed
  // cell below for why the seed is closed too.
  const locked = entry?.locked;
  // Null is "the program has never set one" — see `getLadder`, which sorts
  // those last rather than proposing a ladder nobody set.
  const spot =
    player.ladderPosition !== null ? `S${player.ladderPosition}` : "—";
  const qualifying = entry?.draw === QUALIFYING;
  // A qualifier holds no seed, and `3c` draws an em dash rather than the word.
  const seeded = !qualifying && entry !== undefined && entry.seed !== "";
  const seedLabel = qualifying
    ? "—"
    : seeded
      ? `Seed ${entry.seed}`
      : "Unseeded";

  return (
    <div
      className={cn(
        "grid h-[52px] grid-cols-[32px_1fr_132px_88px] items-center gap-3",
        last ? "" : "border-b border-[var(--border-hairline)]"
      )}
    >
      <span
        className="mono tabular text-[11px]"
        style={{ color: "var(--ink-500)" }}
      >
        {spot}
      </span>

      <span
        className={cn(
          "truncate text-[13px] text-[var(--ink-900)]",
          entry ? "font-medium" : "font-normal"
        )}
      >
        {name}
      </span>

      {/* The row's whole control surface: a draw enters the player, `—` takes
          them back out. `appearance-none` is what stops the platform drawing a
          chevron the artboard does not draw here.

          A settled entry's select is disabled rather than hidden, so the draw
          it is in stays legible, and the micro beside it says why the row is
          closed. `—` is unreachable there, which is the point: a played entry
          cannot be taken out of the field, and `planEntryChanges` would refuse
          the whole save if it tried. */}
      <span className="flex min-w-0 items-center gap-1.5">
        <select
          aria-label={`Draw for ${name}`}
          value={entry?.draw ?? ""}
          disabled={locked !== undefined}
          onChange={(event) => onDraw(event.target.value)}
          className={cn(
            "min-w-0 flex-1 appearance-none bg-transparent text-[12px] outline-none",
            locked ? "cursor-default" : "cursor-pointer",
            entry ? "text-[var(--ink-600)]" : "text-[var(--ink-400)]"
          )}
        >
          <option value="">—</option>
          {DRAWS.map((draw) => (
            <option key={draw} value={draw}>
              {draw}
            </option>
          ))}
        </select>
        {locked ? (
          <span
            className="text-micro shrink-0"
            style={{ color: "var(--ink-500)" }}
          >
            {locked === "forfeited" ? "Forfeited" : "Played"}
          </span>
        ) : null}
      </span>

      {entry === undefined ? (
        // Nobody to hold a seed. Drawn rather than dropped so the column does
        // not collapse under an unentered row and shift every cell beside it.
        <span
          className="mono tabular text-[11px]"
          style={{ color: "var(--ink-300)" }}
          aria-hidden="true"
        >
          —
        </span>
      ) : locked ? (
        // Read-only, and NOT because the seed is uninteresting: `changed()` in
        // `entry-plan.ts` compares `seed` on a tournament row, so a settled
        // entry whose seed moved is an entry the save refuses — and a refusal
        // is total, taking every other edit in the field with it. An editable
        // cell here would be a control that silently costs the coach their
        // whole save. Correcting a played entry's seed is a job for whoever
        // can also delete the match.
        <span
          className="mono tabular text-[11px]"
          style={{ color: seeded ? "var(--ink-600)" : "var(--ink-400)" }}
        >
          {seedLabel}
        </span>
      ) : qualifying || !editingSeed ? (
        <button
          type="button"
          aria-label={`Seed for ${name}`}
          // A qualifier's dash is not a control: there is no seed to type, so
          // the cell reports that rather than opening a field that would have
          // to throw the number away.
          disabled={qualifying}
          onClick={() => setEditingSeed(true)}
          className="mono tabular cursor-pointer text-left text-[11px] disabled:cursor-default"
          style={{ color: seeded ? "var(--ink-600)" : "var(--ink-400)" }}
        >
          {seedLabel}
        </button>
      ) : (
        <input
          autoFocus
          value={entry.seed}
          inputMode="numeric"
          placeholder="seed"
          aria-label={`Seed for ${name}`}
          // Digits only, filtered on the way in rather than validated on the
          // way out — `Number("3rd")` is `NaN`, and a NaN seed reaches the
          // column as a write that fails long after the coach typed it.
          //
          // A leading zero goes the same way, and for the same reason: the
          // column is `check (seed is null or seed > 0)`, so "0" is a value the
          // database refuses. Stripping it here means the cell can never hold a
          // seed the write will reject, rather than the coach discovering it as
          // a raw constraint error under a tournament that failed to save. Four
          // digits is past any real draw and keeps `Number()` inside `integer`.
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
          className="mono tabular w-full bg-transparent text-[11px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-300)]"
        />
      )}
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
interface TournamentFormat {
  /** The `<select>` option's value — matched against, never split. */
  value: EventFormatValue;
  label: string;
  bestOf: number;
  adScoring: boolean;
}

/**
 * `3c`'s wording over the shared format table.
 *
 * Only the words live here — `3c` abbreviates where `2b` spells out. `bestOf`
 * and `adScoring` come from `EVENT_FORMATS` in `lib/schedule/format.ts`, so the
 * two builders cannot disagree about the pair that reaches the database. See
 * that table's header, and `docs/ui-revamp-guardrails.md` §3.1 and §4.
 */
const FORMAT_LABELS: Record<EventFormatValue, string> = {
  "bo3-no-ad": "Bo3 · no-ad",
  "bo3-ad": "Bo3 · ad",
  "one-set-no-ad": "One set · no-ad",
  "one-set-ad": "One set · ad",
};

const FORMATS: readonly TournamentFormat[] = EVENT_FORMATS.map((format) => ({
  ...format,
  label: FORMAT_LABELS[format.value],
}));

/** What `3c` draws in the Format cell: best of 3, ad scoring. */
const DEFAULT_FORMAT =
  FORMATS.find((format) => format.value === "bo3-ad") ?? FORMATS[0];

/**
 * The three sites an event can hold, labelled as both dormant forms label them.
 *
 * `EventSite` on `value`, so the union is checked here rather than cast at the
 * change handler.
 */
const SITES: readonly { value: EventSite; label: string }[] = [
  { value: "away", label: "Away" },
  { value: "home", label: "Home" },
  { value: "neutral", label: "Neutral" },
];

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
 * One cell of the four-up row: `padding:6px 0 7px` under a hairline.
 *
 * A `<div>`, not a `<label>`, and the eyebrow is only the visible caption —
 * every control inside names itself with the same string. It was a `<label>`
 * while all four cells held a native control. Two of them now hold `DateField`,
 * whose segments are `[tabindex]` divs (not labelable) sitting beside a real
 * `<button>` for the calendar: a `<label>` wrapper forwards every click on a
 * segment to that button, and the month segment becomes impossible to click
 * into. So the wrapper stops labelling, and `FieldSelect` — which had no name
 * of its own — takes a `label` and sets it as its `aria-label`. Dropping the
 * wrapper without that would have left both selects unnamed with nothing
 * visibly wrong.
 *
 * The rule answers focus, exactly as the dual builder's `FieldCell` does: 2px
 * blue on `focus-within`, a pixel off the padding so the row does not grow.
 * That change is what earns every control in here the right to drop the focus
 * ring — see `styles/design-system/focus.css`. It is a pair, not a decoration:
 * `DateField`'s segments opt out unconditionally, so a cell that did not answer
 * focus would show no indicator at all.
 */
function FieldCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="eyebrow">{label}</span>
      {/* 34px, the underline family's one height — the same reason the dual
          builder's cell carries it: a row sized by its content stopped
          matching its neighbours once the date brought a calendar button.
          Borders are inside the box, so the 2px focus rule moves nothing. */}
      <span className="flex h-[34px] items-center border-b border-[var(--border-hairline)] transition-colors focus-within:border-b-2 focus-within:border-[var(--blue)]">
        {children}
      </span>
    </div>
  );
}

/**
 * The two cells `3c` draws with a chevron.
 *
 * A native `<select>` under the artboard's own underline treatment, so the
 * value the app will store is in the document rather than implied by a label.
 * The chevron is the artboard's; `appearance-none` is what stops the platform
 * drawing a second one.
 *
 * `label` is the cell's eyebrow, repeated here as the `aria-label`. It is not
 * duplication for its own sake: `FieldCell` is no longer a `<label>` (see
 * there), so this is the only name the select has.
 */
function FieldSelect({
  label,
  value,
  options,
  onChange,
}: {
  /** The cell's eyebrow. The select's only accessible name. */
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        // The cell's rule now goes 2px blue on focus, so the neutral field
        // ring inset inside it would be a second mark on a field that has
        // already answered — the same opt-out the underline family takes
        // (`styles/design-system/focus.css`).
        data-focus-ring="none"
        className="w-full cursor-pointer appearance-none bg-transparent text-[13px] text-[var(--ink-900)] outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        strokeWidth={1.5}
        className="pointer-events-none size-3 shrink-0 text-[var(--ink-400)]"
      />
    </>
  );
}
