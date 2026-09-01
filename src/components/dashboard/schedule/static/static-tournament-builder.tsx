"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Info, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { advButton } from "@/lib/ui/adv-button";
import { EventShell } from "@/components/dashboard/schedule/event-shell";
import {
  TOURNAMENT_FIELD,
  type TournamentFieldRow,
} from "@/lib/schedule/fixtures";
import type { LadderPlayer } from "@/lib/data/roster-server";

/**
 * `3c` — the new tournament, master and detail, rendered from fixtures.
 *
 * The roster on the left feeds the entries on the right. There is no lineup and
 * there are no matches: a tournament entry is a player in a draw, and a match
 * exists once it is played, which is what the footer promises in as many words.
 *
 * ── Static ─────────────────────────────────────────────────────────────────
 * Nothing here fetches. `tournament-form.tsx` is the DB-wired implementation of
 * this same screen and stays exactly where it is, dormant, for the re-wiring —
 * this component is not a replacement for it, does not import it, and does not
 * import `entry-editor.tsx`'s `RosterRail` / `EntryList` either, because `3c`
 * draws a narrower screen than those two build (see "What 3c does not draw"
 * below). The rows come from `TOURNAMENT_FIELD` in `lib/schedule/fixtures.ts`,
 * whose `player` half is the `LadderPlayer` the dormant rail already takes and
 * whose `entry` half is an `EventEntry` out of `TOURNAMENT_DETAIL`.
 *
 * The 232px sidebar and the 44px "Meridian State › Schedule › New tournament"
 * topbar the artboard draws are the app's own chrome and already on screen —
 * that crumb trail is `SCHEDULE_LEAF_LABELS` in `lib/dashboard/nav.ts`, read by
 * `getStaticBreadcrumbs()` in `app/dashboard/header.tsx`.
 *
 * ── One row per player, so the two panes cannot describe different people ──
 * This is master–detail, and the failure mode of master–detail is a right-hand
 * pane that names one person over another person's facts. It is structurally
 * impossible here: `TOURNAMENT_FIELD` pairs each player with their own entry in
 * a single literal, both panes render `row.player.name` and nothing else for a
 * name, and the entered set is keyed on `row.player.userId` — never on a name,
 * never on a list index. The entries list is a `filter` over the same array the
 * rail iterates, in the same order, so a seed can only ever be printed beside
 * the player whose row it came from.
 *
 * ── What is live, and why ──────────────────────────────────────────────────
 * The rail's `+` rows add, and each entry row's `x` removes; those are the two
 * controls `3c` draws a hover state and a `cursor:pointer` on. The three rows
 * it draws as already entered carry a check and NO hover, so they are not
 * buttons here — removal is the `x`, which is the affordance the artboard
 * actually states.
 *
 * Everything else in the right pane is drawn rather than wired, the same
 * treatment `2c`'s search field gets in `dual-school-step.tsx`: the name is a
 * `<span>` because that is what `3c` draws, and Create is inert because this
 * route writes nothing.
 *
 * ── What `3c` does not draw, and this therefore does not build ─────────────
 * No doubles section, no "Add a name" control beside the entries header, no
 * Surface or Hosted-by cell, no draw or seed editing — every one of which
 * `tournament-form.tsx` and `entry-editor.tsx` build. `3c` draws the draw and
 * the seed as plain text, and its entries hint reads "added from the roster"
 * rather than the dormant list's "from the roster, or typed".
 *
 * ── What the design draws that this app cannot know ────────────────────────
 * The info callout — "3 Big Ten programs are in this field — matches against
 * them count toward conference seeding." — has no source in this codebase.
 * Nothing records which programs attend a tournament, and `tournament-form.tsx`
 * says so in its own header and deliberately omits the callout. This rebuild
 * draws it, because the artboard draws it, and it is reported: the same bargain
 * `dual-school-step.tsx` strikes with `2c`'s "18–4" and "5 of 1,940".
 */
export function StaticTournamentBuilder() {
  const [entered, setEntered] = useState<ReadonlyMap<string, FieldEntry>>(
    initialEntries
  );

  // The same array the rail walks, filtered — not a second list. Each surviving
  // element carries its own entry, so no row is ever paired with a lookup that
  // could return somebody else's. `position` in the real write is the index
  // here, which is why roster order is the order.
  const field = TOURNAMENT_FIELD.flatMap((row) => {
    const entry = entered.get(row.player.userId);
    return entry ? [{ row, entry }] : [];
  });

  function enter(player: LadderPlayer) {
    setEntered((current) => {
      const next = new Map(current);
      // What the dormant `toggle()` puts on a freshly entered player: the main
      // draw, unseeded. `3c` draws no way to change either, so this is where a
      // re-added player lands and stays.
      next.set(player.userId, { draw: MAIN_DRAW, seed: null });
      return next;
    });
  }

  function remove(player: LadderPlayer) {
    setEntered((current) => {
      const next = new Map(current);
      next.delete(player.userId);
      return next;
    });
  }

  return (
    <EventShell flush>
      {/*
       * `3c`'s main column: the two panes, then the footer.
       *
       * `EventShell`'s own `footer` slot pads `px-12 pb-[22px] pt-4` — 48/22,
       * which is 25b's. `3c` draws `padding:16px 32px 20px`, so the footer is
       * hand-rolled at the artboard's own values and this column is what holds
       * it under the flush body's row. `flush` itself is what the two panes
       * need: no body padding, and `overflow-hidden` so each pane scrolls
       * inside its own box instead of the page scrolling as one.
       */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          <RosterRail entered={entered} onEnter={enter} />

          {/* `flex:1;min-width:0;overflow:auto;padding:24px 32px;gap:22px` */}
          <div className="flex min-w-0 flex-1 flex-col gap-[22px] overflow-y-auto px-8 py-6">
            <div>
              <span className="eyebrow">Tournament · name</span>
              {/* Drawn, not wired — a `<span>`, as `3c` draws it. The 2px blue
                  rule is the artboard's; see `2c`'s search field for the same
                  call. */}
              <div className="mt-1 flex items-center border-b-2 border-[var(--blue)] pb-2 pt-1.5">
                <span className="text-[22px] font-light tracking-[-0.4px] text-[var(--ink-900)]">
                  Buckeye Fall Classic
                </span>
              </div>

              {/* `repeat(4, 1fr)`, `gap:24px`, `margin-top:16px` — the
                  artboard's, not `field-row.tsx`'s 14/32, which is 25b's. */}
              <div className="mt-4 grid grid-cols-4 gap-6">
                <FieldCell label="Starts">
                  <span
                    className="mono text-[13px]"
                    style={{ color: "var(--ink-900)" }}
                  >
                    10-03
                  </span>
                </FieldCell>
                <FieldCell label="Ends">
                  <span
                    className="mono text-[13px]"
                    style={{ color: "var(--ink-900)" }}
                  >
                    10-05
                  </span>
                </FieldCell>
                <FieldCell label="Site">
                  <DrawnSelect value={SITE.value} label={SITE.label} />
                </FieldCell>
                <FieldCell label="Format">
                  <DrawnSelect value={FORMAT.value} label={FORMAT.label} />
                </FieldCell>
              </div>
            </div>

            {/* Reproduced as drawn. Nothing in this app records which programs
                attend a tournament, so neither the count nor the seeding claim
                can be computed from anything we hold — see the header. */}
            <div className="flex items-start gap-2.5 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-3 py-2.5">
              <Info
                strokeWidth={1.5}
                className="mt-0.5 size-[13px] shrink-0 text-[var(--ink-500)]"
              />
              <div className="text-[11px] leading-[1.6] text-[var(--ink-600)]">
                <span className="font-medium text-[var(--ink-900)]">
                  3 Big Ten programs are in this field
                </span>{" "}
                — matches against them count toward conference seeding.
              </div>
            </div>

            <div>
              <div className="flex items-baseline gap-2.5 border-b border-[var(--border-hairline)] pb-[9px]">
                <span className="eyebrow">Entries · singles</span>
                <span
                  className="text-micro"
                  style={{ color: "var(--ink-500)" }}
                >
                  added from the roster
                </span>
              </div>

              <div className="mt-1 flex flex-col">
                {field.map(({ row, entry }, index) => (
                  <EntryRow
                    key={row.player.userId}
                    row={row}
                    entry={entry}
                    last={index === field.length - 1}
                    onRemove={() => remove(row.player)}
                  />
                ))}
              </div>

              {/* Scaffolding, not design copy. `3c` draws three entries and no
                  empty state, and the only way to reach zero is the `x` it
                  does draw — so the section says what it is rather than going
                  silently blank. Trimmed from the dormant list's own empty
                  line, minus the typed path this screen has not got. */}
              {field.length === 0 ? (
                <p className="text-micro py-3" style={{ color: "var(--ink-500)" }}>
                  Nobody yet — add players from the roster.
                </p>
              ) : null}

              <p className="text-micro mt-2.5" style={{ color: "var(--ink-500)" }}>
                An entry is a player in a draw — where they start, not what
                they&#39;ll play.
              </p>
            </div>
          </div>
        </div>

        {/* `padding:16px 32px 20px`, `gap:12px` — the artboard's own. */}
        <div className="flex shrink-0 items-center gap-3 border-t border-[var(--border-hairline)] px-8 pb-5 pt-4">
          {/* Inside the rebuilt set. */}
          <Link
            href="/dashboard/team/schedule"
            className={advButton("ghost", "md")}
          >
            Cancel
          </Link>
          <div className="flex-1" />
          <span className="text-[11px]" style={{ color: "var(--ink-600)" }}>
            Creates <span className="tabular">{field.length}</span>{" "}
            {field.length === 1 ? "entry" : "entries"} and no matches — a match
            exists once it&#39;s played
          </span>
          {/* Drawn and inert: this route writes nothing, so a Create that
              navigated would claim a tournament that does not exist. The same
              treatment `2c`'s "Add … as an unlisted school" gets. */}
          <button type="button" className={advButton("primary", "md")}>
            Create tournament
          </button>
        </div>
      </div>
    </EventShell>
  );
}

/**
 * What one entered player is, on this screen: where they start and their seed.
 *
 * Keyed by `LadderPlayer.userId` in the map above, never by name or by index —
 * a name key is how "Seed 3" ends up under the wrong person once two rows share
 * a surname, and an index key is how it happens the moment a row is removed.
 *
 * `draw` is nullable because `EventEntry.draw` is, and a null is left as one
 * rather than defaulted: the cell then prints nothing instead of asserting a
 * draw nobody chose.
 */
interface FieldEntry {
  draw: string | null;
  seed: number | null;
}

/** `DRAWS[0]` in `entry-editor.tsx` — a stored value, not a label. */
const MAIN_DRAW = "Main draw";

/** The other one. `3c` draws it on Rafael Osei's row. */
const QUALIFYING = "Qualifying";

/**
 * The Site cell's stored value and the label `3c` prints for it.
 *
 * `"neutral"` is the `EventSite` union member, and "Neutral" is both what the
 * artboard draws and what `SITES` in either dormant form labels it.
 */
const SITE = { value: "neutral", label: "Neutral" } as const;

/**
 * The Format cell's control value and the label `3c` prints for it.
 *
 * ── The encoding ───────────────────────────────────────────────────────────
 * `"<bestOf>|<adScoring>"`, which is the convention `FORMATS` uses in BOTH
 * dormant forms (`tournament-form.tsx:40`, `dual-form.tsx:52`) and which
 * `dual-form.tsx:266` decodes as `format.split("|")` → `Number(bestOf)` and
 * `adScoring === "true"`. `3c` draws "Bo3 · ad" — best of 3, ad scoring — so
 * the value is `"3|true"`, `FORMATS`' second row in both tables.
 *
 * ── Why it is a literal and must stay one ──────────────────────────────────
 * NOT interpolated from `TOURNAMENT_FORMAT`'s `EventFormat`. `adScoring` is
 * `boolean | null`, and a null interpolates to the string `"null"`, which
 * `=== "true"` reads as a confident `false` — a wrong answer that looks like a
 * real one. That is the exact outage `tournament-form.tsx`'s own header
 * records: format arrived `{}`, `adScoring` was null, and every tournament
 * video failed vendor submission long after the coach had left the wizard.
 * See `docs/ui-revamp-guardrails.md` §3.1 and §4.
 */
const FORMAT = { value: "3|true", label: "Bo3 · ad" } as const;

/** The three rows `3c` draws with a check, as the map the rail reads. */
function initialEntries(): ReadonlyMap<string, FieldEntry> {
  return new Map(
    TOURNAMENT_FIELD.flatMap(({ player, entry }) =>
      entry
        ? [[player.userId, { draw: entry.draw, seed: entry.seed }] as const]
        : []
    )
  );
}

/**
 * The rail's state line — their ladder spot, then what entering them did.
 *
 * The same four shapes `stateLine()` produces in `entry-editor.tsx`, which is
 * private to that module. `3c` draws all four: "S1 · entered · seed 3",
 * "S2 · entered", "S3 · qualifying", and a bare "S4".
 */
function railSubline(
  player: LadderPlayer,
  entry: FieldEntry | undefined
): string {
  // Null is "the program has never set one" — see `getLadder`. Every row in
  // the fixture carries a number because `3c` prints one for every row.
  const spot =
    player.ladderPosition !== null ? `S${player.ladderPosition}` : "Unranked";
  if (!entry) return spot;
  if (entry.draw === QUALIFYING) return `${spot} · qualifying`;
  return entry.seed !== null
    ? `${spot} · entered · seed ${entry.seed}`
    : `${spot} · entered`;
}

/**
 * `3c`'s left rail — the roster, and one click to put someone in the field.
 *
 * The search field is a real input over these six rows and nothing else, so it
 * cannot answer with something it does not hold; `2c`'s field is drawn instead
 * of wired precisely because there was no directory behind that one.
 */
function RosterRail({
  entered,
  onEnter,
}: {
  entered: ReadonlyMap<string, FieldEntry>;
  onEnter: (player: LadderPlayer) => void;
}) {
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const shown = needle
    ? TOURNAMENT_FIELD.filter(({ player }) =>
        player.name.toLowerCase().includes(needle)
      )
    : TOURNAMENT_FIELD;

  return (
    <div className="flex min-h-0 w-[320px] shrink-0 flex-col border-r border-[var(--border-hairline)]">
      {/* `padding:18px 20px 12px` */}
      <div className="shrink-0 px-5 pb-3 pt-[18px]">
        <span className="eyebrow">Roster</span>
        <label className="mt-2.5 flex h-8 items-center gap-[9px] rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-2.5">
          <Search
            strokeWidth={1.5}
            className="size-3.5 shrink-0 text-[var(--ink-500)]"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Add a player to the field"
            aria-label="Add a player to the field"
            className="w-full min-w-0 bg-transparent text-[12px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-600)]"
          />
        </label>
      </div>

      {/* `flex:1;overflow:auto;padding:0 12px 12px` */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {shown.length === 0 ? (
          <p className="text-micro px-2.5 py-2" style={{ color: "var(--ink-500)" }}>
            No player by that name.
          </p>
        ) : null}

        {shown.map(({ player }) => (
          <RailRow
            key={player.userId}
            player={player}
            entry={entered.get(player.userId)}
            onEnter={() => onEnter(player)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * One rail row.
 *
 * An entered row is a `<div>` and an available one a `<button>`, because that
 * is the split `3c` draws: only the `+` rows carry a hover wash, and the check
 * rows carry none. A checked row that took focus and did nothing would be
 * worse than a picture of one, and taking a player back out has its own drawn
 * control — the `x` on their entry.
 */
function RailRow({
  player,
  entry,
  onEnter,
}: {
  player: LadderPlayer;
  entry: FieldEntry | undefined;
  onEnter: () => void;
}) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-[13px] text-[var(--ink-900)]",
            entry ? "font-medium" : "font-normal"
          )}
        >
          {player.name}
        </span>
        <span
          className="text-micro mt-0.5 block truncate"
          style={{ color: "var(--ink-600)" }}
        >
          {railSubline(player, entry)}
        </span>
      </span>
      {entry ? (
        <Check
          strokeWidth={1.5}
          className="size-[13px] shrink-0 text-[var(--blue)]"
        />
      ) : (
        <Plus
          strokeWidth={1.5}
          className="size-3.5 shrink-0 text-[var(--ink-400)]"
        />
      )}
    </>
  );

  // `display:flex;align-items:center;gap:10px;padding:10px`
  const shape =
    "flex w-full items-center gap-2.5 rounded-[var(--radius-element)] p-2.5 text-left";

  if (entry) {
    return <div className={shape}>{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={onEnter}
      className={cn(
        shape,
        "cursor-pointer transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)]"
      )}
    >
      {body}
    </button>
  );
}

/**
 * One entry row — the player, where they start, their seed, and the `x`.
 *
 * Every cell reads off the one `TournamentFieldRow` it was handed: the name is
 * `row.player.name`, the same string the rail printed, and the draw and the
 * seed are that player's own entry. There is no second list to fall out of step
 * with, and no lookup that could return somebody else's.
 */
function EntryRow({
  row,
  entry,
  last,
  onRemove,
}: {
  row: TournamentFieldRow;
  entry: FieldEntry;
  last: boolean;
  onRemove: () => void;
}) {
  const name = row.player.name;
  const qualifying = entry.draw === QUALIFYING;
  // A qualifier holds no seed, and `3c` draws an em dash rather than the word.
  const seeded = !qualifying && entry.seed !== null;
  const seed = qualifying ? "—" : seeded ? `Seed ${entry.seed}` : "Unseeded";

  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_120px_96px_24px] items-center gap-3 py-[9px]",
        last ? "" : "border-b border-[var(--border-hairline)]"
      )}
    >
      <span className="truncate text-[13px] text-[var(--ink-900)]">{name}</span>
      <span className="text-[12px] text-[var(--ink-600)]">{entry.draw}</span>
      <span
        className="mono text-[11px]"
        style={{ color: seeded ? "var(--ink-600)" : "var(--ink-400)" }}
      >
        {seed}
      </span>
      <button
        type="button"
        aria-label={`Remove ${name}`}
        onClick={onRemove}
        className="cursor-pointer justify-self-end text-[var(--ink-400)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--danger)]"
      >
        <X strokeWidth={1.5} className="size-[13px]" />
      </button>
    </div>
  );
}

/** One cell of the four-up row: `padding:6px 0 7px` under a hairline. */
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
      <div className="flex items-center border-b border-[var(--border-hairline)] pb-[7px] pt-1.5">
        {children}
      </div>
    </div>
  );
}

/**
 * A cell `3c` draws with a chevron, as the one option it draws.
 *
 * A real `<select>` rather than a styled span, so the value the app stores is
 * in the document rather than implied by a label — that is the whole point of
 * the Format cell (see `FORMAT`). One option each, because the artboard states
 * one value per cell and inventing labels for the alternatives in its own
 * shorthand ("Bo3 · ad") would be writing copy the design never wrote.
 * `defaultValue` rather than `value`: nothing on this static screen consumes a
 * change, and a controlled select with no handler is a React warning.
 */
function DrawnSelect({ value, label }: { value: string; label: string }) {
  return (
    <>
      <select
        defaultValue={value}
        aria-label={label}
        className="w-full cursor-pointer appearance-none bg-transparent text-[13px] text-[var(--ink-900)] outline-none"
      >
        <option value={value}>{label}</option>
      </select>
      <ChevronDown
        strokeWidth={1.5}
        className="pointer-events-none size-3 shrink-0 text-[var(--ink-400)]"
      />
    </>
  );
}
