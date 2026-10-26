"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Search } from "lucide-react";
import { ProgramCrest } from "@/components/dashboard/settings/teams/program-crest";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { useProgramSearch } from "@/components/dashboard/schedule/static/use-program-search";
import {
  FloatMenuDivider,
  floatMenuToneClasses,
} from "@/components/ui/float-menu";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { divisionLabel } from "@/lib/data/programs-server";
import { squadLabel, toGenderedSquad, toSquad } from "@/lib/data/squad";
import { advField } from "@/lib/ui/adv-field";
import { cn } from "@/lib/utils";
import type {
  OpponentTeamProgram,
  OpponentTeamSource,
} from "./new-match-wizard/types";

/**
 * What the field hands back: a directory program that was `picked`, or a
 * school kept as `typed`. Never both — the two `matches` columns behind it are
 * either/or (`opponentTeamColumns`, `new-match-wizard/opponent-team.ts`).
 */
export type OpponentTeamChange =
  | { program: OpponentTeamProgram; school: null; source: "picked" }
  | { program: null; school: string; source: "typed" };

/** How many directory rows the menu lists before the as-typed row. */
const MAX_RESULTS = 6;

/** A blue text action: 11px, no icon, darkening on hover — never to ink. */
const LINK_CLS =
  "cursor-pointer text-[11px] font-medium whitespace-nowrap text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]";

/**
 * One row of the results menu — `FloatMenuItem`'s own geometry (7px radius,
 * 10/7 inset, the `--surface-subtle` wash), restated here because that
 * component's leading slot is a 12px glyph and this row leads with a crest.
 */
const ROW_CLS =
  "flex w-full cursor-pointer items-center gap-2.5 rounded-[7px] px-2.5 py-[7px] text-left transition-colors duration-100 hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)] focus-visible:outline-none";

/**
 * "Their team" — the optional answer about which program an opponent plays
 * for, as one line under their name. Three states and no fourth:
 *
 * - **link** — nothing set: an 11px blue "Add their team".
 * - **search** — a small underline input over the program directory
 *   (`useProgramSearch`, two characters and up). Results are crest + school +
 *   "division · conference"; under a hairline, one row keeps what was typed
 *   for a school the directory does not hold. Esc, or leaving the input with
 *   nothing picked, goes back to whatever was there before.
 * - **chosen** — crest + school + "Change". A team remembered from the last
 *   match against this opponent says so on a second line; one that came from
 *   the scheduled `line` is the line's to decide, so it has no Change.
 *
 * Men's and women's are the same school twice, so the squad decides which
 * row is right. A men's or women's workspace searches its own squad only
 * (`useProgramSearch`'s `squad`, a filter in `search_programs`) under a "Women's teams" label, and its rows and
 * chosen team leave the squad unsaid. Anywhere else — a personal or co-ed
 * workspace — every row LEADS with its squad, where truncation cannot cut it,
 * and the chosen team keeps it: "University of San Diego · Women's".
 *
 * Driven entirely by props so the upload wizard, the edit-match dialog and the
 * opponent drawer can each hold the value their own way. It lives under a name
 * and never in a column of its own — the caller mounts it inside the name cell.
 *
 * Two optional slots, both for the opponent drawer, where a pick is a write
 * rather than a form value: `lead` is the words the link finishes ("No team ·
 * Add their team") and belongs to the link state alone, and `searchNote` is a
 * line between the search input and its menu saying what a pick will change.
 * The menu hangs under the note, so the note is never behind it.
 *
 * Design: Team Opponents → "Giving an opponent a team".
 */
export function OpponentTeamField({
  program,
  school,
  source,
  onChange,
  opponentFirstName,
  readOnly = false,
  lead,
  searchNote,
  className,
}: {
  /** The directory program, when the team is one. */
  program?: OpponentTeamProgram | null;
  /** The school as typed (or the line's school), when there is no program. */
  school?: string | null;
  /** How the value was filled; `"line"` reads back with no Change link. */
  source?: OpponentTeamSource | null;
  onChange: (next: OpponentTeamChange) => void;
  /** For "From your last match against {first name}". */
  opponentFirstName?: string;
  /** Read back only — the same as a `"line"` value, for any other reason. */
  readOnly?: boolean;
  /** Text the "Add their team" link finishes; the link state only. */
  lead?: React.ReactNode;
  /** A line under the search input, above its menu; the search state only. */
  searchNote?: React.ReactNode;
  className?: string;
}) {
  const [searching, setSearching] = useState(false);
  const [term, setTerm] = useState("");
  const [active, setActive] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Set when the search closes by Esc or a pick — the input the keyboard was
  // in is gone, so focus goes back to the link. Left alone on blur: focus
  // already went where the person sent it.
  const restoreFocus = useRef(false);
  const listId = useId();
  const noteId = useId();

  const typed = term.trim();
  // A men's or women's team searches its own squad only, narrowed in the SQL
  // so the route's row limit counts only rows it can pick.
  const { active: workspace } = useWorkspace();
  const ownSquad = toGenderedSquad(workspace.team);
  // A row the enrichment read could not give an id cannot be pointed at as a
  // program, so it is not offered as one — the as-typed row covers it.
  const results = useProgramSearch(searching ? term : "", ownSquad)
    .filter((row) => Boolean(row.id))
    .slice(0, MAX_RESULTS);
  const ready = typed.length >= 2;
  // Directory rows, then the as-typed row.
  const rowCount = ready ? results.length + 1 : 0;
  const activeIndex = Math.min(active, Math.max(rowCount - 1, 0));

  useEffect(() => {
    if (searching || !restoreFocus.current) return;
    restoreFocus.current = false;
    triggerRef.current?.focus();
  }, [searching]);

  const open = () => {
    setTerm("");
    setActive(0);
    setSearching(true);
  };
  const close = () => setSearching(false);
  const dismiss = () => {
    restoreFocus.current = true;
    close();
  };

  const pickRow = (index: number) => {
    const row = results[index];
    if (row?.id) {
      onChange({
        program: {
          id: row.id,
          schoolName: row.schoolName,
          shortCode: row.schoolAbbrev ?? null,
          crestUrl: row.crestUrl ?? null,
          conference: row.conference,
          division: row.division,
          team: row.team,
        },
        school: null,
        source: "picked",
      });
    } else {
      if (!ready) return;
      onChange({ program: null, school: typed, source: "typed" });
    }
    dismiss();
  };

  const locked = readOnly || source === "line";
  const name = program?.schoolName ?? school?.trim() ?? "";
  // Said only where both squads could have been picked.
  const chosenSquad = ownSquad ? null : squadLabel(toSquad(program?.team));

  if (searching && !locked) {
    return (
      <span className={cn("flex min-w-0 flex-col", className)}>
        <Popover
          open
          // Only Esc reaches this: outside presses are declined below and
          // left to the input's blur, which is the one signal for "left it".
          onOpenChange={(next) => {
            if (!next) dismiss();
          }}
        >
          {/* The anchor is the input AND the note, so the menu opens under
              both — the note is read before a row is picked, not behind it. */}
          <PopoverAnchor asChild>
            <span className="flex max-w-full flex-col items-start gap-1.5">
              <span className="relative flex w-[200px] max-w-full items-center">
                <Search
                  className="pointer-events-none absolute left-0 size-3 text-[var(--ink-500)]"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <input
                  autoFocus
                  value={term}
                  placeholder="Search schools"
                  aria-label="Their team"
                  role="combobox"
                  aria-autocomplete="list"
                  // True for as long as the search is on screen: the menu under
                  // it is (a hint, then rows), and the wizard's own Escape
                  // handler stands down for an expanded control.
                  aria-expanded="true"
                  aria-controls={listId}
                  aria-describedby={searchNote ? noteId : undefined}
                  aria-activedescendant={
                    rowCount > 0 ? `${listId}-${activeIndex}` : undefined
                  }
                  // The underline going 2px blue is the focus mark; a ring
                  // would be a second one. See `advField()` and `focus.css`.
                  data-focus-ring="none"
                  autoComplete="off"
                  onChange={(e) => {
                    setTerm(e.target.value);
                    setActive(0);
                  }}
                  onBlur={close}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      e.stopPropagation();
                      dismiss();
                    } else if (e.key === "ArrowDown" && rowCount > 0) {
                      e.preventDefault();
                      setActive((activeIndex + 1) % rowCount);
                    } else if (e.key === "ArrowUp" && rowCount > 0) {
                      e.preventDefault();
                      setActive((activeIndex - 1 + rowCount) % rowCount);
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      if (rowCount > 0) pickRow(activeIndex);
                    }
                  }}
                  className={cn(
                    advField("underline"),
                    "h-7 w-full pl-[18px] text-[12px] outline-none",
                  )}
                />
              </span>
              {searchNote ? (
                <span
                  id={noteId}
                  className="tabular text-[11px] leading-[1.4] text-[var(--ink-500)]"
                >
                  {searchNote}
                </span>
              ) : null}
            </span>
          </PopoverAnchor>
          <PopoverContent
            align="start"
            sideOffset={6}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
            // Keeps focus in the input while a row is pressed, so the press
            // lands as a pick rather than as the blur that cancels the search.
            onMouseDown={(e) => e.preventDefault()}
            className={cn(floatMenuToneClasses(), "w-[268px]")}
          >
            <div
              id={listId}
              role="listbox"
              aria-label={
                ownSquad ? `${squadLabel(ownSquad)} teams` : "Their team"
              }
              className="flex flex-col"
            >
              {ready ? (
                <>
                  {ownSquad && results.length > 0 && (
                    <span
                      aria-hidden="true"
                      className="px-2.5 pt-1.5 pb-1 text-[11px] text-[var(--ink-500)]"
                    >
                      {squadLabel(ownSquad)} teams
                    </span>
                  )}
                  {results.map((row, index) => (
                    <button
                      key={row.id}
                      id={`${listId}-${index}`}
                      type="button"
                      role="option"
                      aria-selected={index === activeIndex}
                      tabIndex={-1}
                      onClick={() => pickRow(index)}
                      className={cn(
                        ROW_CLS,
                        index === activeIndex && "bg-[var(--surface-subtle)]",
                      )}
                    >
                      <ProgramCrest
                        name={row.schoolName}
                        crestUrl={row.crestUrl ?? null}
                        shortCode={row.schoolAbbrev}
                        size={26}
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-px">
                        <span className="truncate text-[12px] text-[var(--ink-900)]">
                          {row.schoolName}
                        </span>
                        <SquadLine
                          squad={
                            ownSquad ? null : squadLabel(toSquad(row.team))
                          }
                          detail={[divisionLabel(row.division), row.conference]
                            .filter(Boolean)
                            .join(" · ")}
                        />
                      </span>
                    </button>
                  ))}
                  {results.length > 0 && <FloatMenuDivider />}
                  <button
                    id={`${listId}-${results.length}`}
                    type="button"
                    role="option"
                    aria-selected={activeIndex === results.length}
                    tabIndex={-1}
                    onClick={() => pickRow(results.length)}
                    className={cn(
                      ROW_CLS,
                      activeIndex === results.length &&
                        "bg-[var(--surface-subtle)]",
                    )}
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-px">
                      <span className="truncate text-[12px] text-[var(--ink-900)]">
                        Use &ldquo;{typed}&rdquo; as typed
                      </span>
                      <span className="text-[11px] text-[var(--ink-500)]">
                        Not in the directory
                      </span>
                    </span>
                  </button>
                </>
              ) : (
                <span className="px-2.5 py-[7px] text-[11px] text-[var(--ink-400)]">
                  Type their school.
                </span>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </span>
    );
  }

  if (!name) {
    if (locked) return null;
    const link = (
      <button
        ref={triggerRef}
        type="button"
        onClick={open}
        className={cn(LINK_CLS, !lead && cn("self-start", className))}
      >
        Add their team
      </button>
    );
    if (!lead) return link;
    return (
      <span className={cn("text-[12px] text-[var(--ink-600)]", className)}>
        {lead}
        {link}
      </span>
    );
  }

  return (
    <span className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <span className="flex min-w-0 items-center gap-2">
        <ProgramCrest
          name={name}
          crestUrl={program?.crestUrl ?? null}
          shortCode={program?.shortCode}
          size={26}
        />
        <span className="min-w-0 truncate text-[12px] text-[var(--ink-700)]">
          {name}
          {chosenSquad && (
            <span className="text-[var(--ink-500)]"> · {chosenSquad}</span>
          )}
        </span>
        {!locked && (
          <button
            ref={triggerRef}
            type="button"
            onClick={open}
            aria-label={`Change their team, ${name}`}
            className={cn(LINK_CLS, "shrink-0")}
          >
            Change
          </button>
        )}
      </span>
      {source === "history" && opponentFirstName && (
        <span className="text-[11px] leading-[1.4] text-[var(--ink-500)]">
          From your last match against {opponentFirstName}
        </span>
      )}
    </span>
  );
}

/**
 * A result row's second line: the squad first, a step darker, then
 * "division · conference". First because the line truncates, and the squad
 * is the half that tells two rows of one school apart.
 */
function SquadLine({
  squad,
  detail,
}: {
  squad: string | null;
  detail: string;
}) {
  return (
    <span className="truncate text-[11px] text-[var(--ink-500)]">
      {squad && (
        <span className="font-medium text-[var(--ink-700)]">{squad}</span>
      )}
      {squad && detail && " · "}
      {detail}
    </span>
  );
}
