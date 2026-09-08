"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CircleCheck, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useListboxNav } from "@/hooks/use-listbox-nav";
import { normalizedPersonName } from "@/lib/data/person-name";
import { splitNames } from "@/lib/schedule/format";
import {
  saveOpponentPlayer,
  type OpponentRosterCandidate,
} from "@/lib/schedule/actions";

/**
 * How many roster rows the list offers at once.
 *
 * `2d` draws three, and three was right while this was only a
 * near-duplicate warning — "is this the same person?", not a search result
 * page. It is a roster PICKER now: it opens on the opponent's saved names
 * before a character is typed, and a real collegiate roster runs eight to
 * twelve deep, so a cap of three hid most of the pool and made the control
 * look broken on the schools that have one. The list scrolls past this
 * number rather than growing the popup, and the keyboard walks the whole of
 * it — see `listRef` for the scroll-into-view that costs.
 */
const MAX_SUGGESTIONS = 8;

/** `dual-build-step.tsx`'s own spelling of a directory school's key. The pool
 *  is the only thing that parses it, and only to recover the program key the
 *  roster write needs — see `OpponentPool.programKey`. */
const PROGRAM_KEY_PREFIX = "program:";

/**
 * Module-private, and that is the whole mechanism: no other file can write
 * this key, so no other file can produce an `OpponentPool`.
 *
 * `const` on a `Symbol()` call gives TypeScript a `unique symbol`, which is
 * what lets it appear as a computed key in the interface below. It is erased
 * from nobody's bundle — it is a real runtime property — but it costs one
 * symbol per pool and is never read at runtime.
 */
const POOL = Symbol("opponent-pool");

/**
 * A school and the saved roster that belongs to THAT school, as one value.
 *
 * ── The failure this shape exists to make unwriteable ───────────────────────
 * The popup dedupes a typed name against a pool of saved names. If the pool it
 * dedupes against belongs to a different school than the one on screen, it
 * either merges two different people or fails to merge the same person — and
 * the screen looks entirely correct either way. It is worse than a stray row:
 * `contribute_opponent_player` matches by name WITHIN the target program, so a
 * name resolved against the wrong pool can silently attach to a real,
 * different person there (`opponent-name-cell.tsx`'s `OpponentTarget` header
 * states the same rule for the DB-wired cell).
 *
 * Two props — a `schoolName` and a `candidates` — leave that mistake one
 * transposed argument away at every call site, and nothing on screen would
 * report it. So there are not two props. There is one object, it carries both
 * halves, and `opponentPoolFor()` below is the only thing that can build one:
 * the interface is keyed on a symbol this module does not export, so an
 * object literal assembled anywhere else is not an `OpponentPool` and will not
 * type-check as the popup's prop.
 *
 * `key` is the school's identity in the same key space the rows are keyed on
 * (`program:<programKey>` or `text:<typed name>`), and it is what the factory
 * checks the fetched roster against.
 */
export interface OpponentPool {
  readonly [POOL]: true;
  /** `program:<programKey>` for a directory pick, `text:<name>` for a typed
   *  opponent. The rows' remount key, and the factory's gate. */
  readonly key: string;
  /** The school's own name, in full — every string the popup prints reads it
   *  from here, so the toast and the prose cannot name different schools. */
  readonly schoolName: string;
  /**
   * `programs.program_key` for a directory school, null for free text — the
   * argument `saveOpponentPlayer` takes, and the popup's answer to "is there a
   * program to save an identity TO?".
   *
   * **Derived from `key`, never passed in.** A second constructor argument
   * would be a second thing a call site could transpose, which is the exact
   * failure this whole interface exists to make unwriteable: a name saved
   * against the wrong program's key can attach to a real, different person
   * there. `key` already IS the program key, prefixed, so recovering it here
   * cannot disagree with the school the popup is drawing.
   */
  readonly programKey: string | null;
  /** The saved names to dedupe against — this school's, or none. */
  readonly candidates: readonly OpponentRosterCandidate[];
}

/**
 * Build the pool for the school currently on screen.
 *
 * `fetched` is whatever the last completed `opponentRosterForDual()` returned,
 * **stamped with the key it was fetched for**. The candidates are handed on
 * only while that stamp still matches the school being drawn, so a change of
 * school empties the pool in the same render that changes the name — not in an
 * effect a tick later, and not after an in-flight request lands. A school with
 * no directory row (a club side typed past the directory) has no roster to
 * fetch and gets an empty pool, which is the popup's "nothing to warn about"
 * state rather than an error.
 */
export function opponentPoolFor(
  key: string,
  schoolName: string,
  fetched: { forKey: string; candidates: OpponentRosterCandidate[] } | null
): OpponentPool {
  return {
    [POOL]: true,
    key,
    schoolName,
    // `slice`, not a split on ":" — a program key is opaque and a colon in one
    // must not truncate it. A `text:` key yields null, which is the popup's
    // "no program to save to" and the reason free text stays free text.
    programKey: key.startsWith(PROGRAM_KEY_PREFIX)
      ? key.slice(PROGRAM_KEY_PREFIX.length)
      : null,
    candidates: fetched?.forKey === key ? fetched.candidates : [],
  };
}

/**
 * `2d` and `2e` — the add-opponent popup, in the two states of one component.
 *
 * The paired frames are one popup moving, not two screens: `2d` is it open
 * with a close saved name surfaced, `2e` is the same anchor a beat later,
 * holding the confirmation while the line behind it reads resolved. So there
 * is one component and one piece of local state saying which — no second
 * popup exists.
 *
 * ── The one thing this must not do ─────────────────────────────────────────
 * Attach a name to a line other than the one it was typed on, or to a school
 * other than the one it was typed against. `OpponentTarget.key`
 * (`opponent-name-cell.tsx`) and the deleted `dual-form.tsx`'s `takeOpponent`
 * existed for the second half of that: `contribute_opponent_player` matches by
 * name WITHIN the target program, so a name carried across a re-target does not
 * merely create a stray row — it can silently attach to a real, different
 * person.
 *
 * This component cannot address a line at all. It holds no line id, no index
 * and no map; `onCommit` is the only way out and it is a closure the owning
 * row builds over its own setter, so the one row that renders a popup is the
 * only row that popup can ever write to.
 *
 * The school half is `OpponentPool` above: the name this popup prints and the
 * roster it dedupes against arrive as ONE value that only `opponentPoolFor()`
 * can build, so there is no call site at which they can be made to disagree.
 * The row's React key carries the same `pool.key`, so a re-target — once the
 * rail offers one — remounts every popup and no draft, suggestion or pending
 * confirmation survives it.
 *
 * ── Reading and writing, as of the picker-parity pass ──────────────────────
 * `pool.candidates` is the opponent's real pooled roster, fetched by
 * `dual-build-step.tsx` through `opponentRosterForDual()`, and this is a
 * roster PICKER over it rather than a near-duplicate warning: with names
 * saved, opening the field lists them, and typing filters. A school with no
 * pooled roster — a club side typed past the directory, or a program nobody
 * has entered yet — gets no list at all and the field alone, which is the
 * free-text fallback and the only behaviour those schools ever had.
 *
 * "Save as a different player" now calls `saveOpponentPlayer` — the write
 * `opponent-name-cell.tsx` did per-pick, left uncalled since the re-wiring
 * for want of a popup that earned a real confirmation. `createDual`'s
 * best-effort loop at submit still contributes every opposing name; this is
 * the same converging RPC run earlier, so the coach is told the truth while
 * the answer is still on screen rather than after the form is gone.
 *
 * ── The confirmation says only what happened ───────────────────────────────
 * Three sentences, because there are three outcomes, and `2e` drew one of
 * them for all three (see `SAVED_NOTE`). Picking a name already on the pool
 * saves nothing and says so; a contribution the server confirms gets `2e`'s
 * own words; a contribution refused — and every arm of
 * `contribute_opponent_player` can legitimately refuse, most often "that
 * program manages its own roster" — must not claim a roster the coach cannot
 * see. `saveOpponentPlayer` swallows failure and answers `{ saved: false }`,
 * so a refusal and an outage are the same sentence here, which is the honest
 * one either way.
 *
 * ── Where the exact-vs-fuzzy line falls ────────────────────────────────────
 * The dormant cell's rule, unchanged, because the design draws its result:
 * matching for the SUGGESTION is loose — substring over
 * `normalizedPersonName`, which is what surfaces "Alexis Castellano" under
 * "Alexis Cast" — while what gets written is exact. Picking the card adopts
 * the roster's own spelling verbatim; declining it keeps the typed text
 * verbatim; nothing in between exists.
 *
 * ── What `2d`/`2e` do not draw ─────────────────────────────────────────────
 * Escape, clicking away, and the arrow keys. The two frames draw two explicit
 * save actions and `2e`'s caption names exactly those two ("picking an
 * existing name (or saving a new one)"), so those are the only two paths that
 * write: Escape and a click outside close and revert, and the line keeps what
 * it had. That is a deliberate departure from the dormant cell, which commits
 * on blur — on a screen whose failure mode is a name landing on a line nobody
 * meant, a third implicit write path is the wrong side to err on.
 *
 * ── The keyboard is `useListboxNav`, not a fourth hand-rolled copy ─────────
 * Arrows, Home/End, Enter and Escape come from `hooks/use-listbox-nav.ts`,
 * the same hook `team/invite-target-picker.tsx` walks its options with, and
 * the ARIA is that picker's shape: the field is the `combobox` and points at
 * the active row through `aria-activedescendant`, the rows are real
 * `option`s inside a real `listbox`. It was `role="dialog"` over plain
 * buttons, which announced a list of buttons rather than a choice with a
 * current one — and its own Arrow/Enter/Escape handler, which is how two
 * pickers on one screen drift on what a key does. The one behaviour the hook
 * does not cover is Enter on a field with NO list under it: that is the
 * free-text fallback, handled beside the hook rather than inside it.
 */
export function OpponentPopup({
  value,
  addLabel,
  discipline,
  pool,
  draftName,
  onCommit,
  onActiveChange,
}: {
  /** The line's current opposing label(s), " / "-joined. Empty until resolved. */
  value: string;
  /** "Add name" or "Add pair" — the row's own trigger copy, from `2b`. */
  addLabel: string;
  discipline: "singles" | "doubles";
  /** The school and ITS saved roster, inseparably — see `OpponentPool`. */
  pool: OpponentPool;
  /** What `2d` has typed. Seeded on open for a line with nothing on it yet. */
  draftName: string;
  onCommit: (value: string) => void;
  /** Open, or holding the confirmation — the row lifts its stacking on it. */
  onActiveChange: (active: boolean) => void;
}) {
  // Destructured from the one object rather than taken as two props: this is
  // the read side of the coupling, and it cannot pull a name and a roster from
  // two different schools because there is only one school here to pull from.
  //
  // `2d` writes the school short ("Ridgeline") where `2e`'s toast writes it in
  // full ("Ridgeline University"), which is the design's own inconsistency
  // (`DUAL_DRAFT_OPPONENT_SHORT` records it). `programs` holds no short form
  // and no rule the design states derives one — "Fairmont" for "Fairmont A&M"
  // is wrong — so the live popup writes the full name in both places, which is
  // what the dormant cell does too.
  const { schoolName, candidates, programKey } = pool;

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  /** `2e`'s card text, or null. Set only by the paths that reach the line. */
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const popupRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  /**
   * Which save's answer is still the current one.
   *
   * `saveOpponentPlayer` is a round trip, and its answer picks the
   * confirmation sentence. Between the request and the reply the coach can
   * reopen the field and resolve a different name — so a reply is allowed to
   * write a confirmation only while the token it was issued under is still
   * the latest. Every path that starts or supersedes a save bumps it.
   */
  const saveToken = useRef(0);

  // Namespaces the option ids. Nine lines can each hold a popup, and two lists
  // sharing an id space would point `aria-activedescendant` at another row's
  // option — the accessible spelling of this file's one forbidden mistake.
  const listboxId = `opponent-options-${useId()}`;

  // The segment being typed — for doubles, the text after the last "/", so a
  // pair field dedupes the partner under the caret rather than the whole pair.
  const segments = draft.split("/");
  const activeSegment = segments[segments.length - 1].trim();
  const typed = normalizedPersonName(activeSegment);

  /**
   * Is there a pooled roster to pick from at all?
   *
   * The whole picker hangs off this. No saved names means no list, no "save
   * as a different player" card — "different" from nothing is not a choice —
   * and no roster write: the field is the field, and Enter commits the typed
   * text. That is the fallback a club side typed past the directory has
   * always had, and it is unchanged.
   */
  const hasRoster = candidates.length > 0;

  /**
   * The rows, in the picker's two modes.
   *
   * Under two characters it is a browse — the pool in its own order, which
   * `opponentRosterForDual` already sorted by lineup spot, so "#1" is the row
   * a coach reaches for first. From two characters it is a filter, and the
   * ranking is the dormant cell's: exact hits, then prefixes, then
   * substrings, so the strongest claim to "this is the same person" carries
   * the ↵. Loose ON PURPOSE, and only ever for the suggestion — what gets
   * written is the roster's own spelling, verbatim. See the header.
   */
  const options = ((): readonly OpponentRosterCandidate[] => {
    if (!open || !hasRoster) return [];
    if (typed.length < 2) return candidates.slice(0, MAX_SUGGESTIONS);
    return candidates
      .map((candidate) => {
        const saved = normalizedPersonName(candidate.name);
        const rank =
          saved === typed
            ? 0
            : saved.startsWith(typed)
              ? 1
              : saved.includes(typed)
                ? 2
                : -1;
        return { candidate, rank };
      })
      .filter((entry) => entry.rank >= 0)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, MAX_SUGGESTIONS)
      .map((entry) => entry.candidate);
  })();

  // The last row, and only once there is typed text to name on it. Browsing
  // the pool with an empty field has no "different player" to offer yet.
  const showNewCard = hasRoster && typed.length >= 2;
  const rowCount = options.length + (showNewCard ? 1 : 0);

  /**
   * Has the coach actually put the cursor on a row?
   *
   * Browse mode draws a list before a character is typed, and a listbox
   * always has a current option — so row zero is highlighted from the moment
   * the field opens. Enter on an untouched empty field would then commit the
   * opponent's #1 player onto a line nobody chose, which is the one thing
   * this component's header forbids. So a highlight the coach did not put
   * there does not answer Enter: only arrowing, Home/End or hovering makes
   * the selection theirs, and typing two characters makes it a match rather
   * than a default (there the top row IS the answer, which is `2d`'s rule).
   */
  const [walked, setWalked] = useState(false);

  const { activeIndex, setActiveIndex, optionId, onKeyDown: walkList } =
    useListboxNav({
      count: rowCount,
      open,
      onSelect: (index) => activateRow(index),
      // Escape reverts. The line keeps what it had — see the header.
      onDismiss: () => setOpen(false),
      idPrefix: listboxId,
    });

  /**
   * Park the cursor back on the first row whenever the rows themselves change.
   *
   * The hook resets on a change of COUNT, which is not enough here: a
   * keystroke can rewrite the list to a different set of names of the same
   * length, and a cursor left in place would then sit on somebody the coach
   * never looked at while Enter is the fastest way to commit. Compared by
   * identity, not length, so the reset fires on the reorder too.
   *
   * Adjusted during render for the hook's own stated reason — a setState in
   * the render body re-runs the component before it paints, where an effect
   * would paint once with the stale cursor and correct it a frame later.
   */
  const optionsKey = options.map((candidate) => candidate.playerId).join(",");
  const [lastOptionsKey, setLastOptionsKey] = useState(optionsKey);
  if (optionsKey !== lastOptionsKey) {
    setLastOptionsKey(optionsKey);
    setActiveIndex(0);
    setWalked(false);
  }

  // The hook never touches the DOM, by design, so keeping the active row
  // inside the scroller is the caller's job — and this list scrolls now that
  // it holds a whole roster rather than three near-duplicates.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, optionsKey]);

  const active = open || confirmation !== null;
  useEffect(() => {
    onActiveChange(active);
    // The row reads this to lift its stacking and to hold the Forfeit
    // affordance visible, which is how `2d` and `2e` both draw that row.
  }, [active, onActiveChange]);

  // Bound only while open, torn down with it — `new-event-menu`'s pattern.
  // Closing on an outside click REVERTS; see the header for why this screen
  // does not commit on blur.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (popupRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!confirmation) return;
    const timer = setTimeout(() => setConfirmation(null), 2800);
    return () => clearTimeout(timer);
  }, [confirmation]);

  function openPopup() {
    // `2d` opens mid-name with the close match already up. A line that already
    // carries a name opens on that name instead — re-opening a resolved cell
    // to change it must not throw the coach's own answer away.
    setDraft(value.trim() === "" ? draftName : value);
    setConfirmation(null);
    setActiveIndex(0);
    setWalked(false);
    // Whatever save is still in flight belongs to the answer the coach has
    // just moved on from; its reply must not toast over this visit.
    saveToken.current += 1;
    setOpen(true);
    queueMicrotask(() => inputRef.current?.focus());
  }

  /**
   * `2e`'s card, verbatim — "Saved to Ridgeline University roster", composed
   * off the same school object the header and the rail's tick read, so the
   * name in the toast and the name on the screen cannot drift.
   *
   * It is now drawn only where it is TRUE: after `saveOpponentPlayer` reports
   * that a row exists on that roster. `2e`'s own caption collapses three
   * outcomes into this one sentence — "picking an existing name (or saving a
   * new one) … toasts the save" — over a frame whose line resolves to "Alexis
   * Castellano", a name the roster already held and that no save created.
   * That collapse is the design's, and reproducing it was defensible while
   * nothing wrote at all; it is not defensible now that something does. The
   * split is the dormant cell's own, restored.
   */
  const savedNote = `Saved to ${schoolName} roster`;
  /** A name the pool already holds. Nothing was written, and nothing claims
   *  otherwise — `opponent-name-cell.tsx`'s wording for the same outcome. */
  const pickedNote = `On ${schoolName}'s saved roster`;
  /** The write did not happen: no program to save to, or the RPC refused. The
   *  line has the name either way, and that is all this says. */
  const lineupNote = "Added to this lineup";

  /**
   * Reach the line, and close.
   *
   * Boundary-normalized to the " / " convention `splitNames` keeps, so a pair
   * reads downstream exactly as every other lineup label does. It says
   * nothing on its own — the caller knows which of the three sentences it
   * earned, and this cannot.
   */
  function commit(next: string) {
    onCommit(splitNames(next).join(" / "));
    setOpen(false);
    saveToken.current += 1;
  }

  /**
   * Contribute the typed identity to the opponent's pool, then say what
   * actually happened.
   *
   * Fired AFTER the line is committed, never before: `saveOpponentPlayer`
   * swallows every failure by design because an identity is an enrichment and
   * never a precondition, so there is nothing here worth making the coach
   * wait on. The reply only picks a sentence.
   */
  async function contributeAndConfirm(name: string) {
    const token = (saveToken.current += 1);
    if (!programKey) {
      setConfirmation(lineupNote);
      return;
    }
    const { saved } = await saveOpponentPlayer({
      opponentProgramKey: programKey,
      name,
    });
    // The coach has resolved something else since; that visit owns the card.
    if (token !== saveToken.current) return;
    setConfirmation(saved ? savedNote : lineupNote);
  }

  /**
   * Adopt the saved name — the roster's exact spelling, verbatim. On a doubles
   * line with a partner still to type, the field resolves the segment and
   * stays open; otherwise the line is done.
   */
  function pickSaved(candidate: OpponentRosterCandidate) {
    const prior = segments
      .slice(0, -1)
      .map((part) => part.trim())
      .filter(Boolean);
    const parts = [...prior, candidate.name];
    if (discipline === "doubles" && parts.length < 2) {
      setDraft(`${parts.join(" / ")} / `);
      setActiveIndex(0);
      inputRef.current?.focus();
      return;
    }
    commit(parts.join(" / "));
    setConfirmation(pickedNote);
  }

  /**
   * Keep the typed text — it names a DIFFERENT person than the close match —
   * and contribute that person to the pool, which is what the card offers.
   *
   * The segment under the caret is what gets contributed, not the whole
   * draft: on a doubles line the partner is a second person and gets its own
   * pass through here. Same shape as `pickSaved`, so the two cards behave
   * alike on a pair.
   */
  function saveAsNew() {
    const prior = segments
      .slice(0, -1)
      .map((part) => part.trim())
      .filter(Boolean);
    const name = activeSegment.trim();
    if (name === "") return;
    const parts = [...prior, name];
    if (discipline === "doubles" && parts.length < 2) {
      setDraft(`${parts.join(" / ")} / `);
      setActiveIndex(0);
      inputRef.current?.focus();
      // Written now, but silently: the popup is still open for the partner,
      // and a confirmation card belongs to a resolved line.
      void contributeAndConfirmSilently(name);
      return;
    }
    commit(parts.join(" / "));
    void contributeAndConfirm(name);
  }

  /** The partner-still-to-type case: contribute, claim nothing. */
  async function contributeAndConfirmSilently(name: string) {
    if (!programKey) return;
    await saveOpponentPlayer({ opponentProgramKey: programKey, name });
  }

  function activateRow(index: number) {
    if (index < options.length) pickSaved(options[index]);
    else saveAsNew();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    // With rows under the field the hook owns every key it handles, including
    // Escape — one handler, so Arrow/Home/End/Enter/Escape cannot mean one
    // thing here and another in the roster's picker.
    if (rowCount > 0) {
      // …except Enter on a highlight the coach never chose. See `walked`:
      // this falls through to the free-text handling below, which is what
      // Enter on this field meant before there was ever a list on it.
      const chosen = typed.length >= 2 || walked;
      if (!(event.key === "Enter" && !chosen)) {
        if (
          event.key === "ArrowDown" ||
          event.key === "ArrowUp" ||
          event.key === "Home" ||
          event.key === "End"
        ) {
          setWalked(true);
        }
        walkList(event);
        return;
      }
    }

    // No list, or a list the coach has not stepped into: the free-text
    // fallback, which the hook deliberately has no opinion about.
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false); // revert — the line keeps what it had
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      // An empty field commits nothing. `splitNames` drops blank parts, so
      // committing "" would hand the line "" — clearing a name the coach had
      // already entered — while still toasting. Close the way Escape does
      // instead: this screen reverts rather than commits on every path that
      // is not a deliberate save.
      if (splitNames(draft).length === 0) {
        setOpen(false);
        return;
      }
      commit(draft);
      // No pool to contribute to, or none fetched — `createDual`'s own loop
      // still contributes every opposing name at submit, so this understates
      // rather than overstates, which is the correct side to err on.
      setConfirmation(lineupNote);
    }
  }

  const resolved = value.trim() !== "";

  return (
    <>
      {/* Column four of `2b`'s line grid. The popup below is a sibling rather
          than a child of this cell because `2d` anchors it to the ROW's right
          edge, not the cell's — `right:0` against the row, which is the grid
          container and the positioned ancestor. */}
      <button
        ref={triggerRef}
        type="button"
        // Guarded: the trigger stays on screen behind the open popup, and a
        // stray click on it must not reset a draft mid-type.
        onClick={() => {
          if (!open) openPopup();
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex w-full min-w-0 cursor-pointer items-center rounded-[3px] text-left outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        {resolved ? (
          // `2e`'s resolved cell — 13px ink-900, the same weight and colour as
          // our own player's name in column two of the same row.
          <span
            className="min-w-0 truncate text-[13px]"
            style={{ color: "var(--ink-900)" }}
          >
            {value}
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1 text-[11px]"
            style={{ color: "var(--ink-400)" }}
          >
            <Plus size={9} strokeWidth={1.5} className="shrink-0" />
            {addLabel}
          </span>
        )}
      </button>

      {open ? (
        <div
          ref={popupRef}
          role="dialog"
          aria-label={
            discipline === "doubles" ? "Add opposing pair" : "Add opposing name"
          }
          className="absolute right-0 top-[calc(100%+8px)] w-[286px] overflow-hidden rounded-[var(--radius-dropdown)] border border-[var(--border-medium)] bg-[var(--surface-card)] text-left shadow-[var(--shadow-dropdown)]"
        >
          <div className="flex items-center gap-2 border-b border-[var(--border-hairline)] px-3 py-[9px]">
            <Search
              size={12}
              strokeWidth={1.5}
              className="shrink-0 text-[var(--ink-400)]"
            />
            {/* `2d` draws the text and then a 1px blue bar beside it, which is
                a static capture's only way to picture a focused field's
                caret. A live field has the real thing, so the bar is the
                caret rather than a span next to one — `caret-color` is the
                same blue at the same 1px. */}
            <input
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={discipline === "doubles" ? "Name / Name" : "Name"}
              // The listbox half of the combobox pattern. The field keeps DOM
              // focus throughout and points at the current row, which is what
              // lets the arrow keys move a selection without moving focus —
              // and what `role="dialog"` over buttons could not say at all.
              role="combobox"
              aria-expanded={rowCount > 0}
              aria-controls={rowCount > 0 ? listboxId : undefined}
              aria-activedescendant={
                rowCount > 0 ? optionId(activeIndex) : undefined
              }
              aria-autocomplete="list"
              data-focus-ring="none" /* the popup frame carries the focus */
              className="w-full min-w-0 bg-transparent text-[12px] text-[var(--ink-900)] caret-[var(--blue)] outline-none placeholder:text-[var(--ink-300)]"
            />
          </div>

          {rowCount > 0 ? (
            <div className="p-3">
              <div className="text-micro" style={{ color: "var(--ink-600)" }}>
                {showNewCard
                  ? `${schoolName} already has a close name saved. Pick one.`
                  : `${schoolName}'s saved roster. Pick one, or type a name.`}
              </div>
              <ul
                ref={listRef}
                id={listboxId}
                role="listbox"
                aria-label={`${schoolName}'s saved roster`}
                className="mt-2.5 flex max-h-[228px] flex-col gap-2 overflow-y-auto"
              >
                {options.map((candidate, index) => (
                  <OptionCard
                    key={candidate.playerId}
                    id={optionId(index)}
                    active={activeIndex === index}
                    onHover={() => {
                      setActiveIndex(index);
                      setWalked(true);
                    }}
                    onClick={() => pickSaved(candidate)}
                    title={candidate.name}
                    strong
                    note={savedSubline(schoolName, candidate)}
                  />
                ))}

                {showNewCard ? (
                  <OptionCard
                    id={optionId(options.length)}
                    active={activeIndex === options.length}
                    onHover={() => {
                      setActiveIndex(options.length);
                      setWalked(true);
                    }}
                    onClick={saveAsNew}
                    title={activeSegment}
                    note="Save as a different player"
                  />
                ) : null}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {!open && confirmation ? (
        <div
          role="status"
          className="absolute right-0 top-[calc(100%+8px)] flex w-[236px] items-center gap-2 overflow-hidden rounded-[var(--radius-dropdown)] border border-[var(--border-medium)] bg-[var(--surface-card)] px-3 py-2.5 shadow-[var(--shadow-dropdown)]"
        >
          <CircleCheck
            size={14}
            strokeWidth={1.5}
            className="shrink-0 text-[var(--viz-good)]"
          />
          <span className="text-[12px]" style={{ color: "var(--ink-900)" }}>
            {confirmation}
          </span>
        </div>
      ) : null}
    </>
  );
}

/**
 * One of `2d`'s two cards. The design draws them as one control in two
 * states, so they are one component: the highlighted card is bordered blue on
 * `--blue-soft` and carries the ↵; the other is hairline-bordered and washes
 * on hover, with a plus where the ↵ was.
 *
 * `strong` is the saved name's 500 weight — the typed text on the second card
 * is drawn at 400, which is the whole of what separates "this already exists"
 * from "this is what you wrote".
 *
 * An `option` rather than the `button` it was. A button inside a listbox is a
 * second tab stop that steals focus from the combobox the arrow keys are
 * driving, and it announces "button" where the row's whole job is to be one
 * of several with a current one. Hovering moves the selection instead of
 * lighting a separate hover state, so the pointer and the keyboard argue over
 * one highlight rather than drawing two.
 */
function OptionCard({
  id,
  active,
  onHover,
  onClick,
  title,
  note,
  strong = false,
}: {
  id: string;
  active: boolean;
  onHover: () => void;
  onClick: () => void;
  title: string;
  note: string;
  strong?: boolean;
}) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      // Read by the scroll-into-view above — the hook moves the selection but
      // never the scroller, so something has to name the current row in DOM.
      data-active={active ? "true" : undefined}
      onMouseEnter={onHover}
      onClick={onClick}
      className={cn(
        "flex w-full shrink-0 cursor-pointer items-center gap-2.5 rounded-[var(--radius-element)] border px-[11px] py-2.5 text-left",
        active
          ? "border-[var(--blue)] bg-[var(--blue-soft)]"
          : [
              "border-[var(--border-hairline)]",
              "transition-colors duration-[var(--duration-hover)]",
            ]
      )}
    >
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-[12px]",
            strong ? "font-medium" : null
          )}
          style={{ color: "var(--ink-900)" }}
        >
          {title}
        </span>
        <span
          className="text-micro mt-0.5 block truncate"
          style={{ color: "var(--ink-600)" }}
        >
          {note}
        </span>
      </span>
      {active ? (
        <span className="mono text-[10px]" style={{ color: "var(--ink-500)" }}>
          ↵
        </span>
      ) : (
        <Plus
          size={12}
          strokeWidth={1.5}
          className="shrink-0 text-[var(--ink-400)]"
        />
      )}
    </li>
  );
}

/**
 * "Saved · Ridgeline #2 · 2 prior meetings" — `2d`'s subline, built the way
 * `opponent-name-cell.tsx` builds it: spot and meetings only when known, since
 * a zero-meeting clause would be the card padding its own case.
 *
 * The school arrives in full, off `pool.schoolName`, as it does in `2e`'s
 * toast — see the destructure at the top of `OpponentPopup` for why the
 * design's short form has no live source to come from.
 */
function savedSubline(
  school: string,
  candidate: OpponentRosterCandidate
): string {
  const parts = [
    candidate.lineupSpot !== null
      ? `Saved · ${school} #${candidate.lineupSpot}`
      : `Saved · ${school}`,
  ];
  if (candidate.priorMeetings === 1) parts.push("1 prior meeting");
  if (candidate.priorMeetings > 1) {
    parts.push(`${candidate.priorMeetings} prior meetings`);
  }
  return parts.join(" · ");
}
