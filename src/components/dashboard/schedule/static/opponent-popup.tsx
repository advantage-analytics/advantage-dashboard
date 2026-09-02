"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCheck, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizedPersonName } from "@/lib/data/person-name";
import { splitNames } from "@/lib/schedule/format";
import type { OpponentRosterCandidate } from "@/lib/schedule/actions";

/** How many close names the popup offers — `opponent-name-cell.tsx`'s number.
 *  More than a couple stops being "is this the same person?" and becomes a
 *  search result page. `2d` draws one. */
const MAX_SUGGESTIONS = 3;

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
 * ── Reading, as of the schedule re-wiring ──────────────────────────────────
 * `pool.candidates` is the opponent's real pooled roster, fetched by
 * `dual-build-step.tsx` through `opponentRosterForDual()`. Nothing here still
 * writes: the confirmation is a statement the design makes rather than a
 * server's answer — see `saveNote` for what that costs — and the opposing
 * names are contributed to that pool by `createDual` at submit, best-effort,
 * once the lines are safely written. `opponent-name-cell.tsx` is the dormant
 * cell that drew these same two states; this component imports none of it.
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
 * meant, a third implicit write path is the wrong side to err on. The arrow
 * keys move the highlight, which is the dormant cell's own behaviour and the
 * only keyboard route to the second card.
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
  const { schoolName, candidates } = pool;

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [highlight, setHighlight] = useState(0);
  /** `2e`'s card text, or null. Set only by the two save paths. */
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const popupRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // The segment being typed — for doubles, the text after the last "/", so a
  // pair field dedupes the partner under the caret rather than the whole pair.
  const segments = draft.split("/");
  const activeSegment = segments[segments.length - 1].trim();
  const typed = normalizedPersonName(activeSegment);

  // Loose ON PURPOSE, and only ever for the suggestion — see the header.
  // Exact hits first, then prefixes, then substrings, so the strongest claim
  // to "this is the same person" carries the ↵.
  const suggestions =
    open && typed.length >= 2
      ? candidates
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
          .map((entry) => entry.candidate)
      : [];

  // Rows the keyboard walks: the saved names, then "save as a different
  // player". The whole list exists only while a close name does — with no
  // near-duplicate to warn about, `2d`'s body has nothing to say and the
  // popup is the field alone.
  const rowCount = suggestions.length > 0 ? suggestions.length + 1 : 0;
  // Clamped on read: a keystroke can remove the row the highlight is parked
  // on, and Enter must never act on a row that is not there.
  const highlighted = Math.min(highlight, Math.max(rowCount - 1, 0));

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
    setHighlight(0);
    setOpen(true);
    queueMicrotask(() => inputRef.current?.focus());
  }

  /**
   * `2e`'s card, verbatim — "Saved to Ridgeline University roster", composed
   * off the same school object the header and the rail's tick read, so the
   * name in the toast and the name on the screen cannot drift.
   *
   * **Reproduced, not corrected.** `2e`'s own caption says "picking an
   * existing name (or saving a new one) … toasts the save", and `2e` draws the
   * line resolved to "Alexis Castellano" — the name the roster ALREADY held.
   * Picking a saved name saves nothing, so on that path the sentence is false;
   * the dormant cell splits the two ("On <school>'s saved roster" for a pick,
   * "Saved to <school> roster" for a real write, and only after the server
   * says a row exists). The design collapses them and this reproduces the
   * design.
   */
  const saveNote = `Saved to ${schoolName} roster`;

  /**
   * The one write path, and the only thing that reaches the line.
   *
   * Boundary-normalized to the " / " convention `splitNames` keeps, so a pair
   * reads downstream exactly as every other lineup label does.
   */
  function save(next: string) {
    onCommit(splitNames(next).join(" / "));
    setOpen(false);
    setConfirmation(saveNote);
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
      setHighlight(0);
      inputRef.current?.focus();
      return;
    }
    save(parts.join(" / "));
  }

  /** Keep the typed text — it names a DIFFERENT person than the close match. */
  function saveAsNew() {
    save(draft);
  }

  function activateRow(index: number) {
    if (index < suggestions.length) pickSaved(suggestions[index]);
    else saveAsNew();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false); // revert — the line keeps what it had
      return;
    }
    if (event.key === "ArrowDown" && rowCount > 0) {
      event.preventDefault();
      setHighlight((was) => Math.min(was + 1, rowCount - 1));
      return;
    }
    if (event.key === "ArrowUp" && rowCount > 0) {
      event.preventDefault();
      setHighlight((was) => Math.max(was - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (rowCount > 0) {
        activateRow(highlighted);
        return;
      }
      // An empty field commits nothing. `splitNames` drops blank parts, so
      // `save("")` would hand the line "" — clearing a name the coach had
      // already entered — while still toasting that it was saved. Close the
      // way Escape does instead: this screen reverts rather than commits on
      // every path that is not a deliberate save.
      if (splitNames(draft).length === 0) {
        setOpen(false);
        return;
      }
      save(draft);
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
              onChange={(event) => {
                setDraft(event.target.value);
                // Reset with the keystroke, not in an effect — the suggestion
                // list is about to change under the highlight.
                setHighlight(0);
              }}
              onKeyDown={onKeyDown}
              placeholder={discipline === "doubles" ? "Name / Name" : "Name"}
              data-focus-ring="none" /* the popup frame carries the focus */
              className="w-full min-w-0 bg-transparent text-[12px] text-[var(--ink-900)] caret-[var(--blue)] outline-none placeholder:text-[var(--ink-300)]"
            />
          </div>

          {suggestions.length > 0 ? (
            <div className="p-3">
              <div className="text-micro" style={{ color: "var(--ink-600)" }}>
                {schoolName} already has a close name saved. Pick one.
              </div>
              <div className="mt-2.5 flex flex-col gap-2">
                {suggestions.map((candidate, index) => (
                  <OptionCard
                    key={candidate.playerId}
                    highlighted={highlighted === index}
                    onClick={() => pickSaved(candidate)}
                    title={candidate.name}
                    strong
                    note={savedSubline(schoolName, candidate)}
                  />
                ))}

                <OptionCard
                  highlighted={highlighted === suggestions.length}
                  onClick={saveAsNew}
                  title={activeSegment}
                  note="Save as a different player"
                />
              </div>
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
 */
function OptionCard({
  highlighted,
  onClick,
  title,
  note,
  strong = false,
}: {
  highlighted: boolean;
  onClick: () => void;
  title: string;
  note: string;
  strong?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-element)] border px-[11px] py-2.5 text-left",
        highlighted
          ? "border-[var(--blue)] bg-[var(--blue-soft)]"
          : [
              "border-[var(--border-hairline)]",
              "transition-colors duration-[var(--duration-hover)]",
              "hover:bg-[var(--surface-subtle)]",
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
      {highlighted ? (
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
    </button>
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
