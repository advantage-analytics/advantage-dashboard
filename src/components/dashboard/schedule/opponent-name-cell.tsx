"use client";

/*
 * PARTLY DORMANT — nothing renders `<OpponentNameCell>` on a live route, but
 * this file is NOT free-standing dead code. DO NOT DELETE IT.
 *
 * Its only importer is `lineup-editor.tsx`, whose component is in turn rendered
 * only by dormant `dual-form.tsx`. So the popover is unreachable today while
 * the module is still the DB-wired half of the re-wire — `saveOpponentPlayer`
 * and the re-target `key` contract described below have no static counterpart.
 * The static stand-in for the popup alone is `static/opponent-popup.tsx`.
 *
 * See `./README.md` for the full live/dormant map.
 */

import { useEffect, useRef, useState } from "react";
import { CircleCheck, Plus, Search } from "lucide-react";
import { normalizedPersonName } from "@/lib/data/person-name";
import { splitNames } from "@/lib/schedule/format";
import {
  saveOpponentPlayer,
  type OpponentRosterCandidate,
} from "@/lib/schedule/actions";

/**
 * The dual's current opponent, as the lineup's popovers need to see it.
 *
 * Built once in `dual-form.tsx` and handed to every line, because the danger
 * with this feature is a popover remembering the LAST opponent: a suggestion
 * list, a resolved name or a pending "saved" toast keyed to School A must not
 * survive a re-target to School B — `contribute_opponent_player` matches by
 * name WITHIN the target program, so a carried-over resolution can attach to a
 * real, different person there. `key` exists for exactly that: the lineup
 * editor keys each cell on it, so a re-target REMOUNTS every popover and no
 * local state of any kind crosses over. The candidate list itself lives
 * upstream, derived against the current program key, and is empty the render
 * the target changes.
 */
export interface OpponentTarget {
  /** Changes whenever the dual is re-targeted — a directory key, or the typed
   *  name for a free-text opponent. The cells' remount key. */
  key: string;
  /** The school's own name ("Ridgeline University"), null for free text. */
  schoolName: string | null;
  /** The directory key, null for free text — what a save is addressed to. */
  programKey: string | null;
  /**
   * Whether "save as a different player" may even try. True only for an
   * unclaimed directory row: `contribute_opponent_player` refuses a program
   * with members ("that program manages its own roster"), and a call that is
   * known to refuse is not worth making. The RPC stays the authority — a
   * false-positive here still degrades silently, it never mis-claims a save.
   */
  canSave: boolean;
  /** The pooled roster, meeting counts attached — empty for free text, for an
   *  opted-out pool, and for the render(s) before the current fetch lands. */
  candidates: OpponentRosterCandidate[];
}

/** How many close names the popover offers. More than a couple stops being
 *  "is this the same person?" and becomes a search result page. */
const MAX_SUGGESTIONS = 3;

/**
 * 2d/2e — the opponent side of a lineup line.
 *
 * A quiet "+ Add name" (doubles: "Add pair") trigger in the row; clicking it
 * opens a floating popover holding the text field. What used to be a bare
 * input gains one behaviour: when the typed name is CLOSE to one the target
 * school's pooled roster already holds, the popover says so before a second
 * spelling of the same person gets written.
 *
 * ── Where the exact-vs-fuzzy line falls ────────────────────────────────────
 * Matching for the SUGGESTION is deliberately loose — substring over
 * `normalizedPersonName`, so "Alexis Cast" surfaces "Alexis Castellano". What
 * gets WRITTEN is deliberately exact: picking the card adopts the roster's own
 * spelling verbatim, declining it keeps the coach's typed text verbatim, and
 * nothing in between exists. No id rides on the line either way — the exact
 * name is the carrier, and `contribute_opponent_player`'s own
 * `lower(btrim())` match at submit is what turns it back into the same row.
 * `roster-match.ts` states the rule this follows.
 *
 * Committing happens at the boundaries — Enter, a pick, or clicking away —
 * never per keystroke, and the committed string keeps `splitNames`' " / "
 * convention, so `benchFromLines` and every entry label downstream read pairs
 * exactly as before.
 */
export function OpponentNameCell({
  value,
  discipline,
  target,
  onCommit,
}: {
  /** The line's current label(s), " / "-joined — `theirLabels.join(" / ")`. */
  value: string;
  discipline: "singles" | "doubles";
  target: OpponentTarget;
  onCommit: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [highlight, setHighlight] = useState(0);
  /** The circle-check card's text, shown only for a claim that is true. */
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
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
      ? target.candidates
          .map((candidate) => {
            const saved = normalizedPersonName(candidate.name);
            const rank =
              saved === typed ? 0 : saved.startsWith(typed) ? 1 : saved.includes(typed) ? 2 : -1;
            return { candidate, rank };
          })
          .filter((entry) => entry.rank >= 0)
          .sort((a, b) => a.rank - b.rank)
          .slice(0, MAX_SUGGESTIONS)
          .map((entry) => entry.candidate)
      : [];

  // Rows the keyboard walks: the saved names, then "save as a different
  // player". The whole list exists only while a close name does — with no
  // near-duplicate to warn about, the popover is just a text field.
  const rowCount = suggestions.length > 0 ? suggestions.length + 1 : 0;
  // Clamped on read: a hover can park the highlight on a row that a later
  // keystroke removes, and Enter must never act on a row that is not there.
  const highlighted = Math.min(highlight, Math.max(rowCount - 1, 0));

  // Bound only while open, torn down with it — `new-event-menu`'s pattern.
  // Clicking away commits the draft, exactly as the bare input it replaces
  // kept whatever had been typed.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) {
        commitDraft();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
    // commitDraft closes over the current draft; re-binding per render is the
    // point, not a leak — the cleanup runs each time.
  });

  useEffect(() => {
    if (!confirmation) return;
    const timer = setTimeout(() => setConfirmation(null), 2800);
    return () => clearTimeout(timer);
  }, [confirmation]);

  function openPopover() {
    setDraft(value);
    setConfirmation(null);
    setOpen(true);
    queueMicrotask(() => inputRef.current?.focus());
  }

  /** The one write path. Boundary-normalized to the " / " convention. */
  function commit(next: string) {
    onCommit(splitNames(next).join(" / "));
    setOpen(false);
  }

  function commitDraft() {
    commit(draft);
  }

  /**
   * Adopt the saved name — the roster's exact spelling, verbatim. On a
   * doubles line with one partner still to type, the field resolves the
   * segment and stays open; otherwise the line is done.
   */
  function pickSaved(candidate: OpponentRosterCandidate) {
    const prior = segments.slice(0, -1).map((part) => part.trim()).filter(Boolean);
    const parts = [...prior, candidate.name];
    if (discipline === "doubles" && parts.length < 2) {
      setDraft(`${parts.join(" / ")} / `);
      setHighlight(0);
      inputRef.current?.focus();
      return;
    }
    commit(parts.join(" / "));
    // A statement about the roster, not about a write — the name was already
    // there, which is the whole reason the card existed.
    if (target.schoolName) {
      setConfirmation(`On ${target.schoolName}'s saved roster`);
    }
  }

  /**
   * Keep the typed text — it names a DIFFERENT person than the close match.
   * The save is best-effort and the toast appears only when the server said a
   * row exists: a claimed program's refusal, a free-text opponent, or a
   * single-token name all degrade to a plain label with no claim made.
   */
  function saveAsNew() {
    const name = activeSegment;
    commit(draft);
    if (!target.canSave || !target.programKey || !target.schoolName) return;
    if (name.split(/\s+/).length < 2) return;
    const school = target.schoolName;
    void saveOpponentPlayer({
      opponentProgramKey: target.programKey,
      name,
    }).then((result) => {
      if (result.saved) setConfirmation(`Saved to ${school} roster`);
    });
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
      if (rowCount > 0) activateRow(highlighted);
      else commitDraft();
    }
  }

  const hasLabel = value.trim() !== "";

  return (
    <div ref={wrapRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        // Guarded: the trigger stays on screen behind the open popover, and a
        // stray click on it must not reset a draft mid-type.
        onClick={() => {
          if (!open) openPopover();
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex w-full min-w-0 cursor-pointer items-center rounded-[3px] py-0.5 text-left outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        {hasLabel ? (
          <span className="min-w-0 truncate text-[13px]" style={{ color: "var(--ink-900)" }}>
            {value}
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1 text-[11px]"
            style={{ color: "var(--ink-400)" }}
          >
            <Plus strokeWidth={1.5} className="size-[9px]" />
            {discipline === "doubles" ? "Add pair" : "Add name"}
          </span>
        )}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={discipline === "doubles" ? "Add opposing pair" : "Add opposing name"}
          className="absolute right-0 top-[calc(100%+6px)] z-30 w-[286px] overflow-hidden rounded-[var(--radius-dropdown)] border border-[var(--border-medium)] bg-[var(--surface-card)] text-left shadow-[var(--shadow-dropdown)]"
        >
          <div className="flex items-center gap-2 border-b border-[var(--border-hairline)] px-3 py-[9px]">
            <Search strokeWidth={1.5} className="size-3 shrink-0 text-[var(--ink-400)]" />
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
              data-focus-ring="none" /* the popover frame carries the focus */
              className="w-full min-w-0 bg-transparent text-[12px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-300)]"
            />
          </div>

          {suggestions.length > 0 ? (
            <div className="p-3">
              <div className="text-micro" style={{ color: "var(--ink-600)" }}>
                {target.schoolName} already has a close name saved. Pick one.
              </div>
              <div className="mt-2.5 flex flex-col gap-2">
                {suggestions.map((candidate, index) => (
                  <button
                    key={candidate.playerId}
                    type="button"
                    onClick={() => pickSaved(candidate)}
                    onMouseEnter={() => setHighlight(index)}
                    className={`flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-element)] border px-[11px] py-2.5 text-left ${
                      highlighted === index
                        ? "border-[var(--blue)] bg-[var(--blue-soft)]"
                        : "border-[var(--border-hairline)]"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-[12px] font-medium"
                        style={{ color: "var(--ink-900)" }}
                      >
                        {candidate.name}
                      </span>
                      <span
                        className="text-micro mt-0.5 block truncate"
                        style={{ color: "var(--ink-600)" }}
                      >
                        {savedSubline(target.schoolName ?? "", candidate)}
                      </span>
                    </span>
                    {highlighted === index ? (
                      <span className="mono text-[10px]" style={{ color: "var(--ink-500)" }}>
                        ↵
                      </span>
                    ) : null}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={saveAsNew}
                  onMouseEnter={() => setHighlight(suggestions.length)}
                  className={`flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-element)] border px-[11px] py-2.5 text-left ${
                    highlighted === suggestions.length
                      ? "border-[var(--blue)] bg-[var(--blue-soft)]"
                      : "border-[var(--border-hairline)]"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-[12px]"
                      style={{ color: "var(--ink-900)" }}
                    >
                      {activeSegment}
                    </span>
                    <span
                      className="text-micro mt-0.5 block"
                      style={{ color: "var(--ink-600)" }}
                    >
                      {/* Only promise a save where one can happen — a claimed
                          program's roster is not ours to write. */}
                      {target.canSave
                        ? "Save as a different player"
                        : "Keep as a different player"}
                    </span>
                  </span>
                  {highlighted === suggestions.length ? (
                    <span className="mono text-[10px]" style={{ color: "var(--ink-500)" }}>
                      ↵
                    </span>
                  ) : (
                    <Plus strokeWidth={1.5} className="size-3 shrink-0 text-[var(--ink-400)]" />
                  )}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {!open && confirmation ? (
        <div
          role="status"
          className="absolute right-0 top-[calc(100%+6px)] z-30 flex w-max max-w-[286px] items-center gap-2 rounded-[var(--radius-dropdown)] border border-[var(--border-medium)] bg-[var(--surface-card)] px-3 py-2.5 shadow-[var(--shadow-dropdown)]"
        >
          <CircleCheck
            strokeWidth={1.5}
            className="size-3.5 shrink-0 text-[var(--viz-good)]"
          />
          <span className="truncate text-[12px]" style={{ color: "var(--ink-900)" }}>
            {confirmation}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** "Saved · Ridgeline #2 · 2 prior meetings" — spot and meetings only when
 *  known; a zero-meeting clause would be the card padding its own case. */
function savedSubline(school: string, candidate: OpponentRosterCandidate): string {
  const parts = [
    candidate.lineupSpot !== null ? `Saved · ${school} #${candidate.lineupSpot}` : `Saved · ${school}`,
  ];
  if (candidate.priorMeetings === 1) parts.push("1 prior meeting");
  if (candidate.priorMeetings > 1) parts.push(`${candidate.priorMeetings} prior meetings`);
  return parts.join(" · ");
}
