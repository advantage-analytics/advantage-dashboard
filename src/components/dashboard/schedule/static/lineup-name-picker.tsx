"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useListboxNav } from "@/hooks/use-listbox-nav";
import { normalizedPersonName } from "@/lib/data/person-name";
import { splitNames } from "@/lib/schedule/format";
import { addProgramPlayer } from "@/components/dashboard/team/roster-actions";
import type { LadderPlayer } from "@/lib/data/roster-server";

export interface RosterSelection {
  ids: string[];
  labels: string[];
}

/**
 * Our side of a lineup court: a field over the roster, not a name to retype.
 *
 * ── The bug this exists to close ────────────────────────────────────────────
 * The cell was a bare `<input>`. `editOurLabels` recomputes `ourIds` from the
 * typed label through `rosterIdsForLabels`, which is exact beyond case and
 * whitespace on purpose — so "Dana Broks" contributed NO id and the dual saved
 * with that court attributed to nobody, with nothing on screen saying so. A
 * coach typing nine names by hand only has to slip once.
 *
 * Singles use this free-text typeahead. Doubles are picked from a checklist
 * in `lineup-rows.tsx` that reports each stable id beside its display label,
 * so same-name athletes (and names containing a slash) are never reparsed
 * into a different identity upstream.
 *
 * ── Everyone, ranked or not ─────────────────────────────────────────────────
 * `seedLineup` seeds S1–S6 from RANKED players only, because roster join order
 * is not a ranking. The list here is the opposite: it offers the whole ladder,
 * unranked players included. A coach-added player with no ladder spot is
 * exactly who goes on as a sub, and before this they were reachable only by
 * typing their name character-perfect.
 *
 * ── Not the opponent popup ──────────────────────────────────────────────────
 * `opponent-popup.tsx` solves a different problem — it is a DEDUPE warning
 * against another school's saved roster, shown only when a close name already
 * exists, and its escape row saves a genuinely different person. This is a
 * plain typeahead over our own roster, always listable, whose escape row
 * CREATES a player. The two share the ranking rule (exact → starts-with →
 * contains) and the keyboard model (`use-listbox-nav`), which is where the
 * sharing ends. Rule of three: if a third roster typeahead appears, extract.
 */

/** The escape row's words. One string so the row and its test cannot drift. */
const ADD_ROW_LABEL = "Don't see your player? Add your player";

/**
 * Said out loud rather than left silent.
 *
 * A label matching nobody still saves — a coach mid-flow against a stale
 * roster is a real case, and `rosterIdsForLabels` deliberately keeps it
 * possible. What it must not do any more is keep it QUIET: the whole defect
 * was a court that looked filled and was attributed to nobody.
 */
const UNMATCHED_NOTE = "not on your roster · no player linked";

/** How many roster rows the list offers before the escape row. */
const MAX_SUGGESTIONS = 6;

/**
 * The segment under the caret.
 *
 * A doubles cell holds two names joined by " / ". Like the opponent popup,
 * this resolves ONE segment at a time and stays open for the partner, so the
 * typeahead filters on the partner being typed rather than on the whole pair.
 */
function activeSegmentOf(value: string): string {
  const segments = value.split("/");
  return segments[segments.length - 1].trim();
}

/** The names already settled in this cell, ahead of the caret. */
function priorSegmentsOf(value: string): string[] {
  return value
    .split("/")
    .slice(0, -1)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function LineupNamePicker(props: {
  value: string;
  selectedIds: string[];
  slot: string;
  discipline: "singles" | "doubles";
  ladder: LadderPlayer[];
  onChange: (value: string) => void;
  onSelection: (selection: RosterSelection) => void;
  onAddPlayer: (player: LadderPlayer, value: string) => void;
  onOpenChange: (open: boolean) => void;
  /** The court is marked "No player" — the field reads so, empty. */
  noPlayer?: boolean;
  /** Offers "No player" as the list's last row. */
  onNoPlayer?: () => void;
  /** Roster id → the other singles line that player already holds. */
  takenOn?: ReadonlyMap<string, string>;
  /** The earlier line this court's player is already on, if any. */
  clashWith?: string;
}) {
  // Doubles no longer come through here: `lineup-rows.tsx`'s `PairPicker` is a
  // pick-two checklist that reports stable ids beside their labels, which is
  // the identity guarantee the two partner selects used to give.
  return <RosterTypeahead {...props} />;
}

function RosterTypeahead({
  value,
  slot,
  discipline,
  ladder,
  onChange,
  onAddPlayer,
  onOpenChange,
  noPlayer = false,
  onNoPlayer,
  takenOn,
  clashWith,
}: {
  /** The line's current label, " / "-joined. The field is controlled by it. */
  value: string;
  /** "S1"…"D3" — the court, for the field's accessible name. */
  slot: string;
  discipline: "singles" | "doubles";
  /** The whole roster, ranked and unranked. */
  ladder: LadderPlayer[];
  selectedIds: string[];
  onChange: (value: string) => void;
  onSelection: (selection: RosterSelection) => void;
  /**
   * A player who did not exist until just now.
   *
   * Reported alongside the label rather than through `onChange`, because the
   * upstream `rosterIdsForLabels` reads a roster that cannot yet contain them:
   * the server action's `revalidatePath` will not have re-rendered this client
   * tree by the time the name has to land. The caller widens the roster and
   * writes the label in one update — see `addOurPlayer` in `dual-build-step`.
   */
  onAddPlayer: (player: LadderPlayer, value: string) => void;
  /** Open — the row lifts its stacking on it, as it does for the popup. */
  onOpenChange: (open: boolean) => void;
  noPlayer?: boolean;
  onNoPlayer?: () => void;
  takenOn?: ReadonlyMap<string, string>;
  clashWith?: string;
}) {
  const [open, setOpen] = useState(false);
  /**
   * Has the coach stepped into the list on purpose?
   *
   * `opponent-popup.tsx`'s flag, for the identical gesture on the identical
   * shape: a highlight the list put there is a suggestion, and only a highlight
   * the coach moved to — or typed toward — is a choice. Reset whenever the
   * list closes, so the next court starts unchosen.
   */
  const [walked, setWalked] = useState(false);
  /** What the server said when a write failed. Never invented locally. */
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeSegment = activeSegmentOf(value);
  const prior = priorSegmentsOf(value);
  const typed = normalizedPersonName(activeSegment);

  // Nobody twice on one court. A pair naming the same athlete on both halves
  // would submit two identical ids against one line.
  const takenBefore = new Set(prior.map((part) => normalizedPersonName(part)));

  // Exact hits first, then prefixes, then substrings — `opponent-popup`'s
  // ranking, over our own ladder. An empty field lists everyone in ladder
  // order, which is how an unranked player is browsed to rather than guessed
  // at.
  const listed = new Set<string>();
  const suggestions = ladder
    // One row per roster id, whatever the caller handed in — the id is the
    // row's React key and the identity a pick writes.
    .filter((player) => {
      if (listed.has(player.userId)) return false;
      listed.add(player.userId);
      return true;
    })
    .filter((player) => !takenBefore.has(normalizedPersonName(player.name)))
    // A player plays one singles line. Whoever holds another court is left
    // out, and named below when the coach types toward them.
    .filter((player) => !takenOn?.has(player.userId))
    .map((player) => {
      if (typed.length === 0) return { player, rank: 3 };
      const known = normalizedPersonName(player.name);
      const rank =
        known === typed
          ? 0
          : known.startsWith(typed)
            ? 1
            : known.includes(typed)
              ? 2
              : -1;
      return { player, rank };
    })
    .filter((entry) => entry.rank >= 0)
    // Stable: `Array.prototype.sort` is specified stable, so equal ranks keep
    // ladder order rather than being reshuffled by rank alone.
    .sort((a, b) => a.rank - b.rank)
    .slice(0, MAX_SUGGESTIONS)
    .map((entry) => entry.player);

  // Players left out because they are on another court, matching what is
  // typed — said, so a missing name is not a mystery.
  const elsewhere =
    typed.length >= 2 && takenOn
      ? ladder.filter(
          (player) =>
            takenOn.has(player.userId) &&
            normalizedPersonName(player.name).includes(typed),
        )
      : [];

  // The escape row is always present — "add your player" is the answer to an
  // empty list as much as to a full one. "No player", where offered, comes
  // after it: the last resort, never the row a bare arrow lands on first.
  const addIndex = suggestions.length;
  const noPlayerIndex = onNoPlayer ? addIndex + 1 : -1;
  const count = suggestions.length + 1 + (onNoPlayer ? 1 : 0);

  function chooseNoPlayer() {
    onNoPlayer?.();
    setOpen(false);
    setError(null);
  }

  /**
   * May Enter commit the highlighted row?
   *
   * Only once the coach has said something about it: typed enough for the
   * ranking to mean anything, or walked the list themselves. The same two
   * conditions `opponent-popup.tsx` uses, so one gesture cannot mean different
   * things on the two halves of the same row.
   */
  const chosen = typed.length >= 2 || walked;

  /**
   * Is the caret in the segment the suggestions were ranked against?
   *
   * `activeSegmentOf` always reads the LAST segment, so on a doubles court a
   * coach who arrows back to fix a typo in the first name is editing text the
   * list is not about. Committing then would write the highlighted row into
   * the last segment and overwrite the partner — with a real roster id and a
   * real name, so nothing on screen would report the wrong athlete. Enter is
   * refused in that position rather than guessing which name was meant.
   *
   * A singles cell has no "/" and always answers true.
   */
  function caretInActiveSegment(): boolean {
    const caret = inputRef.current?.selectionStart;
    if (caret === null || caret === undefined) return true;
    return caret > value.lastIndexOf("/");
  }

  /** Write the cell and stop editing. Boundary-normalized to " / ". */
  function commit(parts: string[]) {
    onChange(splitNames(parts.join(" / ")).join(" / "));
    setOpen(false);
    setError(null);
  }

  /**
   * Take a name onto this court.
   *
   * A doubles court with only one name so far keeps the field open on
   * "Name / " so the partner is typed next, which is the opponent popup's own
   * behaviour for the same shape.
   */
  function place(name: string) {
    const parts = [...prior, name];
    if (discipline === "doubles" && parts.length < 2) {
      onChange(`${parts.join(" / ")} / `);
      setError(null);
      inputRef.current?.focus();
      return;
    }
    commit(parts);
  }

  /**
   * Create the typed person, then place them.
   *
   * `add_program_player` requires both names, so a single word is refused here
   * rather than sent to be refused there — the message is about what to type,
   * which the server cannot know. A failed write prints what the server said
   * and places NOBODY: the court stays as the coach left it rather than
   * quietly holding a name no row backs.
   */
  function addTypedPlayer() {
    const words = activeSegment.split(/\s+/).filter(Boolean);
    if (words.length < 2) {
      setError("Type a first and last name to add a player.");
      inputRef.current?.focus();
      return;
    }
    const firstName = words[0];
    const lastName = words.slice(1).join(" ");
    const name = `${firstName} ${lastName}`;

    setError(null);
    startTransition(async () => {
      const result = await addProgramPlayer({ firstName, lastName });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const parts = [...prior, name];
      if (result.profileId === null) {
        // The row exists — the RPC just did not hand back its id. Write the
        // name; the reload that follows `revalidatePath` resolves the id the
        // ordinary way rather than this component inventing one.
        if (discipline === "doubles" && parts.length < 2) {
          onChange(`${parts.join(" / ")} / `);
          return;
        }
        commit(parts);
        return;
      }
      const player: LadderPlayer = {
        userId: result.profileId,
        name,
        // Added mid-lineup, so nobody has ranked them. `seedLineup` will not
        // seed an unranked player, which is right: this is a sub going on.
        ladderPosition: null,
      };
      if (discipline === "doubles" && parts.length < 2) {
        onAddPlayer(player, `${parts.join(" / ")} / `);
        return;
      }
      onAddPlayer(player, splitNames(parts.join(" / ")).join(" / "));
      setOpen(false);
    });
  }

  const { activeIndex, setActiveIndex, optionId, onKeyDown } = useListboxNav({
    count,
    open,
    onSelect: (index) => {
      if (index < suggestions.length) place(suggestions[index].name);
      else if (index === noPlayerIndex) chooseNoPlayer();
      else addTypedPlayer();
    },
    onDismiss: () => setOpen(false),
    idPrefix: `lineup-${slot}`,
  });

  // The row lifts its stacking while the list is up, the way it does for the
  // opponent popup — nine rows of dropdowns otherwise paint under each other.
  useEffect(() => {
    onOpenChange(open);
  }, [open, onOpenChange]);

  // A closed list forgets that it was walked. Without this the flag survives
  // for the life of the court: arrow into S3 once, and every later visit to S3
  // has Enter armed on row 0 again.
  useEffect(() => {
    if (!open) setWalked(false);
  }, [open]);

  // Bound only while open, torn down with it — the popup's pattern. A blur
  // handler cannot do this job: clicking a row blurs the field first.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (wrapRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  // Every segment the roster does not know. Free text still saves — this only
  // stops it saving silently.
  const unmatched = splitNames(value).filter(
    (label) =>
      !ladder.some(
        (player) =>
          normalizedPersonName(player.name) === normalizedPersonName(label),
      ),
  );

  const listId = `lineup-${slot}-list`;

  return (
    <div ref={wrapRef} className="relative w-full min-w-0">
      <input
        ref={inputRef}
        value={value}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? optionId(activeIndex) : undefined}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setError(null);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          // Enter only selects while the caret is in the segment the list was
          // built from — see `caretInActiveSegment`. Everywhere else it is an
          // ordinary Enter, and the arrows keep working so the coach can still
          // move the highlight before returning the caret.
          if (event.key === "Enter" && !caretInActiveSegment()) return;

          // …and only on a highlight the coach actually chose. See `walked`:
          // focusing an empty court opens the list with everyone in ladder
          // order and the cursor on row 0, so a bare Enter — tabbing through
          // the lineup, or confirming the court above — would write the #1
          // ladder player onto a court nobody assigned, with a real roster id
          // behind a real name. Nothing on screen would report it. Falls
          // through to an ordinary Enter, which is what this field did before
          // it had a list.
          if (event.key === "Enter" && !chosen) return;
          if (
            event.key === "ArrowDown" ||
            event.key === "ArrowUp" ||
            event.key === "Home" ||
            event.key === "End"
          ) {
            setWalked(true);
          }
          onKeyDown(event);
        }}
        placeholder={
          noPlayer
            ? "No player"
            : discipline === "doubles"
              ? "Name / Name"
              : "Name"
        }
        aria-label={`Our player at ${slot}`}
        /* The line is the frame here — a ring inside a lineup cell boxes one
           name of nine — and `lineup-rows.tsx` is what makes this legal: the
           line lifts its wash on focus, so tabbing the lineup moves something
           on screen. Without that this field would have no focus indicator at
           all, which is the one thing `focus.css` says an opt-out may never
           cost. */
        data-focus-ring="none"
        className={cn(
          "block h-[26px] w-full min-w-0 bg-transparent text-[13px] leading-[26px] text-[var(--ink-700)] caret-[var(--blue)] outline-none",
          noPlayer
            ? "placeholder:text-[var(--ink-500)]"
            : "placeholder:text-[var(--ink-300)]",
        )}
      />

      {/* Said whether or not the list is open: the court is filled and linked
          to nobody, which is precisely the state that used to be invisible. */}
      {!open && clashWith !== undefined ? (
        <span
          className="text-micro pointer-events-none absolute top-[calc(100%-4px)] left-0 block max-w-full truncate"
          style={{ color: "var(--ink-500)", lineHeight: 1 }}
        >
          already on {clashWith} · choose another player
        </span>
      ) : !open && unmatched.length > 0 ? (
        <span
          className="text-micro pointer-events-none absolute top-[calc(100%-4px)] left-0 block max-w-full truncate"
          // Inline: `.text-micro` is unlayered and beats a Tailwind leading
          // utility, and its 1.4 line box would hang past the 44px line.
          style={{ color: "var(--ink-500)", lineHeight: 1 }}
        >
          {UNMATCHED_NOTE}
        </span>
      ) : null}

      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={`Players for ${slot}`}
          className="absolute top-[calc(100%+6px)] left-0 z-30 flex max-h-[248px] w-[264px] flex-col overflow-y-auto rounded-[var(--radius-dropdown)] border border-[var(--border-medium)] bg-[var(--surface-card)] p-1.5 shadow-[var(--shadow-dropdown)]"
        >
          {suggestions.map((player, index) => (
            <li
              key={player.userId}
              id={optionId(index)}
              role="option"
              aria-selected={activeIndex === index}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => place(player.name)}
              className={cn(
                "flex h-[38px] cursor-pointer items-center gap-2.5 rounded-[var(--radius-element)] px-2.5",
                activeIndex === index ? "bg-[var(--surface-subtle)]" : null,
              )}
            >
              <span className="truncate text-[12px] text-[var(--ink-900)]">
                {player.name}
              </span>
              <span className="flex-1" />
              {/* The ladder spot, in the app's own `S3` shorthand — the one
                  fact that separates two players with similar names. */}
              <span
                className="mono shrink-0 text-[11px]"
                style={{ color: "var(--ink-500)" }}
              >
                {player.ladderPosition !== null
                  ? `S${player.ladderPosition}`
                  : "—"}
              </span>
            </li>
          ))}

          {suggestions.length > 0 ? (
            <li
              aria-hidden
              className="mx-1 my-1.5 h-px bg-[var(--border-hairline)]"
            />
          ) : null}

          <li
            id={optionId(suggestions.length)}
            role="option"
            aria-selected={activeIndex === suggestions.length}
            onMouseEnter={() => setActiveIndex(suggestions.length)}
            onClick={addTypedPlayer}
            className={cn(
              "flex h-[38px] cursor-pointer items-center gap-2.5 rounded-[var(--radius-element)] px-2.5",
              activeIndex === suggestions.length
                ? "bg-[var(--surface-subtle)]"
                : null,
            )}
          >
            <span
              aria-hidden
              className="flex size-5 shrink-0 items-center justify-center rounded-full border border-dashed border-[var(--ink-300)]"
            >
              <Plus
                className="size-3 text-[var(--ink-500)]"
                strokeWidth={1.5}
              />
            </span>
            <span className="truncate text-[12px] text-[var(--ink-900)]">
              {pending ? "Adding…" : ADD_ROW_LABEL}
            </span>
          </li>

          {onNoPlayer ? (
            <>
              <li
                aria-hidden
                className="mx-1 my-1.5 h-px bg-[var(--border-hairline)]"
              />
              <li
                id={optionId(noPlayerIndex)}
                role="option"
                aria-selected={activeIndex === noPlayerIndex}
                onMouseEnter={() => setActiveIndex(noPlayerIndex)}
                onClick={chooseNoPlayer}
                className={cn(
                  "flex h-[38px] cursor-pointer items-center gap-2.5 rounded-[var(--radius-element)] px-2.5",
                  activeIndex === noPlayerIndex
                    ? "bg-[var(--surface-subtle)]"
                    : null,
                )}
              >
                <span
                  aria-hidden
                  className="size-5 shrink-0 rounded-full border border-dashed border-[var(--ink-300)]"
                />
                <span className="truncate text-[12px] text-[var(--ink-900)]">
                  No player
                </span>
                <span className="flex-1" />
                <span className="shrink-0 text-[11px] text-[var(--ink-500)]">
                  Counts as a forfeit
                </span>
              </li>
            </>
          ) : null}

          {elsewhere.length > 0 ? (
            <li
              role="presentation"
              className="px-2.5 pt-1.5 pb-0.5 text-[11px] text-[var(--ink-500)]"
            >
              {elsewhere
                .slice(0, 2)
                .map(
                  (player) =>
                    `${player.name} is on ${takenOn?.get(player.userId)}`,
                )
                .join(" · ")}
            </li>
          ) : null}

          {error ? (
            <li
              role="alert"
              className="px-2.5 pt-1 pb-0.5 text-[11px]"
              style={{ color: "var(--ink-700)" }}
            >
              {error}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
