"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Info, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { advButton } from "@/lib/ui/adv-button";
import { EventShell } from "@/components/dashboard/schedule/event-shell";
import type { LadderPlayer } from "@/lib/data/roster-server";
import type { EventSite } from "@/lib/schedule/types";

/**
 * `3c` — the new tournament, master and detail, against the program's roster.
 *
 * The roster on the left feeds the entries on the right. There is no lineup and
 * there are no matches: a tournament entry is a player in a draw, and a match
 * exists once it is played, which is what the footer promises in as many words.
 *
 * ── Reading again ──────────────────────────────────────────────────────────
 * The rail was `TOURNAMENT_FIELD` in `lib/schedule/fixtures.ts` for the length
 * of the `events-lineups` rebuild. It is now `getLadder()`'s `LadderPlayer[]`,
 * handed down by the route — the same prop `tournament-form.tsx` takes, which
 * is why this is a loader coming back rather than a new shape. Nothing in this
 * file imports a fixture.
 *
 * The five facts `3c` draws — the name, both dates, the site and the format —
 * are controls now rather than pictures of controls, and they hold what is
 * entered. Writing them is not wired yet: Create is still inert, because a
 * button that navigated would claim a tournament that does not exist.
 *
 * The 232px sidebar and the 44px "Meridian State › Schedule › New tournament"
 * topbar the artboard draws are the app's own chrome and already on screen —
 * that crumb trail is `SCHEDULE_LEAF_LABELS` in `lib/dashboard/nav.ts`, read by
 * `getStaticBreadcrumbs()` in `app/dashboard/header.tsx`.
 *
 * ── One row per player, so the two panes cannot describe different people ──
 * This is master–detail, and the failure mode of master–detail is a right-hand
 * pane that names one person over another person's facts. It is structurally
 * impossible here: both panes render `player.name` off the same `LadderPlayer`
 * and nothing else for a name, and the entered set is keyed on `player.userId`
 * — never on a name, never on a list index. The entries list is a `flatMap`
 * over the same array the rail iterates, in the same order, so a seed can only
 * ever be printed beside the player whose row it came from.
 *
 * ── What `3c` does not draw, and this therefore does not build ─────────────
 * No doubles section, no "Add a name" control beside the entries header, no
 * Surface or Hosted-by cell, no draw or seed editing — every one of which
 * `tournament-form.tsx` and `entry-editor.tsx` build. `3c` draws the draw and
 * the seed as plain text, and its entries hint reads "added from the roster"
 * rather than the dormant list's "from the roster, or typed".
 *
 * The program's `defaultSurface` arrives all the same, because
 * `createTournament` takes a surface and the artboard asks for none. It sits in
 * the draft below rather than on screen: an event created here carries the
 * surface the program already answered, or none at all — never a court type
 * invented on its behalf.
 *
 * ── What the design draws that this app cannot know ────────────────────────
 * The info callout — "3 Big Ten programs are in this field — matches against
 * them count toward conference seeding." — has no source in this codebase.
 * Nothing records which programs attend a tournament, and `tournament-form.tsx`
 * says so in its own header and deliberately omits the callout. This rebuild
 * draws it, because the artboard draws it, and it is reported.
 */
export function StaticTournamentBuilder({
  roster,
  defaultSurface,
}: {
  roster: LadderPlayer[];
  defaultSurface: string | null;
}) {
  const [entered, setEntered] = useState<ReadonlyMap<string, FieldEntry>>(
    () => new Map()
  );
  const [draft, setDraft] = useState<TournamentDraft>(() => ({
    name: "",
    // Both dates today, which is what the dormant form opens on: a tournament
    // that runs one day is the common case, and the coach moves the end date
    // when it does not.
    startsOn: todayISO(),
    endsOn: todayISO(),
    site: DEFAULT_SITE,
    format: DEFAULT_FORMAT,
    // Empty means "the program has not set one", which `createTournament`
    // stores as a null surface. Not "Hard" — a default court type is a fact
    // about a tournament nobody stated.
    surface: defaultSurface ?? "",
  }));

  function edit(patch: Partial<TournamentDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  // The same array the rail walks, filtered — not a second list. Each surviving
  // element carries its own entry, so no row is ever paired with a lookup that
  // could return somebody else's. `position` in the real write is the index
  // here, which is why ladder order is the order.
  const field = roster.flatMap((player) => {
    const entry = entered.get(player.userId);
    return entry ? [{ player, entry }] : [];
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
          <RosterRail roster={roster} entered={entered} onEnter={enter} />

          {/* `flex:1;min-width:0;overflow:auto;padding:24px 32px;gap:22px` */}
          <div className="flex min-w-0 flex-1 flex-col gap-[22px] overflow-y-auto px-8 py-6">
            <div>
              <label className="block">
                <span className="eyebrow">Tournament · name</span>
                {/* The 2px blue rule is the artboard's. What `3c` draws filled
                    in is this field's placeholder: an unnamed tournament is
                    what the screen actually opens on, and `createTournament`
                    refuses one. */}
                <span className="mt-1 flex items-center border-b-2 border-[var(--blue)] pb-2 pt-1.5">
                  <input
                    autoFocus
                    value={draft.name}
                    onChange={(event) => edit({ name: event.target.value })}
                    placeholder="Buckeye Fall Classic"
                    className="w-full bg-transparent text-[22px] font-light tracking-[-0.4px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-300)]"
                  />
                </span>
              </label>

              {/* `repeat(4, 1fr)`, `gap:24px`, `margin-top:16px` — the
                  artboard's, not `field-row.tsx`'s 14/32, which is 25b's. */}
              <div className="mt-4 grid grid-cols-4 gap-6">
                <FieldCell label="Starts">
                  <input
                    type="date"
                    value={draft.startsOn}
                    onChange={(event) => edit({ startsOn: event.target.value })}
                    className="mono w-full bg-transparent text-[13px] text-[var(--ink-900)] outline-none"
                  />
                </FieldCell>
                <FieldCell label="Ends">
                  <input
                    type="date"
                    value={draft.endsOn}
                    onChange={(event) => edit({ endsOn: event.target.value })}
                    className="mono w-full bg-transparent text-[13px] text-[var(--ink-900)] outline-none"
                  />
                </FieldCell>
                <FieldCell label="Site">
                  <FieldSelect
                    value={draft.site}
                    options={SITES}
                    onChange={(value) => {
                      const chosen = SITES.find(
                        (option) => option.value === value
                      );
                      if (chosen) edit({ site: chosen.value });
                    }}
                  />
                </FieldCell>
                <FieldCell label="Format">
                  <FieldSelect
                    value={draft.format.value}
                    options={FORMATS}
                    onChange={(value) => {
                      // The chosen ROW, not a parse of the chosen string. See
                      // `FORMATS` — this is the only assignment `format` has,
                      // and every row of that table states `adScoring` as a
                      // literal boolean.
                      const chosen = FORMATS.find(
                        (option) => option.value === value
                      );
                      if (chosen) edit({ format: chosen });
                    }}
                  />
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
                {field.map(({ player, entry }, index) => (
                  <EntryRow
                    key={player.userId}
                    player={player}
                    entry={entry}
                    last={index === field.length - 1}
                    onRemove={() => remove(player)}
                  />
                ))}
              </div>

              {/* A new tournament starts with nobody in it, so this is the
                  frame the screen actually opens on — `3c` draws three entries
                  because it draws a field already being built. */}
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
          {/* Still inert: this screen holds a draft and writes nothing, so a
              Create that navigated would claim a tournament that does not
              exist. `createTournament` is the next step, not this one. */}
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

/** The five facts `3c` asks for, plus the one it does not draw. */
interface TournamentDraft {
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
 * One row of the Format control: the option it is, and what it means.
 *
 * ── Why this is a table and not an encoding ────────────────────────────────
 * Both dormant forms carry the format through a `<select>` as the string
 * `"<bestOf>|<adScoring>"` and decode it with `format.split("|")` →
 * `Number(bestOf)` and `adScoring === "true"` (`tournament-form.tsx:40`,
 * `dual-form.tsx:52`). That round trip is where the outage lived: `adScoring`
 * is `boolean | null` on `EventFormat`, a null interpolates into that string as
 * the four characters `null`, and `=== "true"` reads those as a confident
 * `false` — a wrong answer that looks like a real one. `tournament-form.tsx`'s
 * own header records the result: format arrived as `{}`, `adScoring` arrived
 * null, and every tournament video failed vendor submission long after the
 * coach had left. See `docs/ui-revamp-guardrails.md` §3.1 and §4.
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
  value: string;
  label: string;
  bestOf: number;
  adScoring: boolean;
}

/**
 * The four formats the control offers.
 *
 * `3c` draws one value — "Bo3 · ad" — and no dropdown contents, so the other
 * three labels are built from vocabulary that already exists rather than
 * invented: "Bo3" is the artboard's own shorthand, and "no-ad" and "One set"
 * are `FORMATS`' words in both dormant forms. The order is those tables' order.
 */
const FORMATS: readonly TournamentFormat[] = [
  { value: "bo3-no-ad", label: "Bo3 · no-ad", bestOf: 3, adScoring: false },
  { value: "bo3-ad", label: "Bo3 · ad", bestOf: 3, adScoring: true },
  { value: "one-set-no-ad", label: "One set · no-ad", bestOf: 1, adScoring: false },
  { value: "one-set-ad", label: "One set · ad", bestOf: 1, adScoring: true },
];

/** What `3c` draws in the Format cell: best of 3, ad scoring. */
const DEFAULT_FORMAT = FORMATS[1];

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

/** Local today, in the `YYYY-MM-DD` shape a date input and the column share. */
function todayISO(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

/** `DRAWS[0]` in `entry-editor.tsx` — a stored value, not a label. */
const MAIN_DRAW = "Main draw";

/** The other one. `3c` draws it on Rafael Osei's row. */
const QUALIFYING = "Qualifying";

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
  // Null is "the program has never set one" — see `getLadder`, which sorts
  // those last rather than proposing a ladder nobody set.
  const spot =
    player.ladderPosition !== null ? `S${player.ladderPosition}` : "Unranked";
  if (!entry) return spot;
  if (entry.draw === QUALIFYING) return `${spot} · qualifying`;
  return entry.seed !== null
    ? `${spot} · entered · seed ${entry.seed}`
    : `${spot} · entered`;
}

/**
 * `3c`'s left rail — the program's roster, and one click to put someone in the
 * field.
 *
 * The search field is a real input over the rows this program actually has, so
 * it cannot answer with something it does not hold; `2c`'s field is drawn
 * instead of wired precisely because there was no directory behind that one.
 */
function RosterRail({
  roster,
  entered,
  onEnter,
}: {
  roster: LadderPlayer[];
  entered: ReadonlyMap<string, FieldEntry>;
  onEnter: (player: LadderPlayer) => void;
}) {
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const shown = needle
    ? roster.filter((player) => player.name.toLowerCase().includes(needle))
    : roster;

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
        {/* A program with nobody on it and a search that found nobody are two
            different answers, and the fixture rail could only ever give the
            second one. */}
        {shown.length === 0 ? (
          <p className="text-micro px-2.5 py-2" style={{ color: "var(--ink-500)" }}>
            {needle
              ? "No player by that name."
              : "No players on the roster yet."}
          </p>
        ) : null}

        {shown.map((player) => (
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
 * Every cell reads off the one `LadderPlayer` it was handed: the name is
 * `player.name`, the same string the rail printed, and the draw and the seed
 * are that player's own entry. There is no second list to fall out of step
 * with, and no lookup that could return somebody else's.
 */
function EntryRow({
  player,
  entry,
  last,
  onRemove,
}: {
  player: LadderPlayer;
  entry: FieldEntry;
  last: boolean;
  onRemove: () => void;
}) {
  const name = player.name;
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

/**
 * One cell of the four-up row: `padding:6px 0 7px` under a hairline.
 *
 * A `<label>` rather than a `<div>`, now that every cell holds a real control:
 * the eyebrow is the control's name, so it labels it rather than sitting beside
 * it, and no cell needs an `aria-label` repeating what is already on screen.
 */
function FieldCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <span className="flex items-center border-b border-[var(--border-hairline)] pb-[7px] pt-1.5">
        {children}
      </span>
    </label>
  );
}

/**
 * The two cells `3c` draws with a chevron.
 *
 * A native `<select>` under the artboard's own underline treatment, so the
 * value the app will store is in the document rather than implied by a label.
 * The chevron is the artboard's; `appearance-none` is what stops the platform
 * drawing a second one.
 */
function FieldSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
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
