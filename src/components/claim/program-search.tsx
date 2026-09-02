"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import type {
  ProgramSearchResult,
  PlayerProgramRow,
} from "@/lib/data/programs-server";
import { teamLabel, programSubtitle } from "@/lib/data/programs-server";
import { advField } from "@/lib/ui/adv-field";

/**
 * One row, in whichever of its two shapes the endpoint sent.
 *
 * The coach intent gets the owner and the claim state; the player intent gets a
 * single `onAdvantage` boolean and nothing else (see `redactForPlayer`). They
 * are a union rather than one optional-everything type so that reading
 * `ownerDisplay` on a player row does not type-check — the redaction is then a
 * property of the code, not of a habit.
 */
type ProgramRow = ProgramSearchResult | PlayerProgramRow;

/** Long enough to stop typing, short enough not to feel laggy. */
const DEBOUNCE_MS = 180;

/**
 * The four columns, once.
 *
 * At page scale the result list is a table, not a stack of two-line cards:
 * school, squad, division and who has it already, each in its own column so a
 * coach scanning for their own program reads down one column instead of across
 * every row. Below `sm` it falls back to a stack, because four columns in
 * 375px is four columns of nothing.
 *
 * The division column is wider than the frame's `1fr`. Real conference names
 * are "Mississippi Association of Community Colleges Conference", not the "Big
 * Sky" the mock happened to use, and it is the one column here with no second
 * chance to be read.
 */
const ROW_GRID =
  "grid gap-2 sm:grid-cols-[minmax(0,1.5fr)_90px_minmax(0,1.3fr)_110px] sm:items-center sm:gap-4";

/**
 * What picking a row means.
 *
 * `claim` is the coach's path and the default. `join` is the player's: they
 * land on the invite request rather than the status page, because the status
 * page's unclaimed branch leads with "Set up this program" and a player must
 * never be routed at that.
 */
export type SearchIntent = "claim" | "join";

export function ProgramSearch({ intent = "claim" }: { intent?: SearchIntent }) {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<ProgramRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Tracks the newest request so a slow early keystroke cannot overwrite the
  // results of a faster later one — the classic typeahead race, where deleting
  // a character briefly restores the longer query's results.
  const latest = useRef(0);

  const query = term.trim();
  // Derived during render, not cleared in an effect. Below two characters
  // there is nothing to show, and that is a property of `term` rather than a
  // separate piece of state to keep in step with it.
  const active = query.length >= 2;

  // Results belong to the last query that ran; an inactive term shows none
  // without any state having to be cleared.
  const visible = active ? results : [];

  useEffect(() => {
    if (!active) return;

    setLoading(true);
    const id = ++latest.current;
    const timer = setTimeout(async () => {
      try {
        // The intent travels with the request, because it decides what the
        // ROUTE is allowed to send back — not merely what this list draws.
        const res = await fetch(
          `/api/programs/search?q=${encodeURIComponent(query)}${
            intent === "join" ? "&intent=join" : ""
          }`
        );
        const body = (await res.json()) as { results: ProgramRow[] };
        if (id !== latest.current) return;
        setResults(body.results ?? []);
        setSearched(true);
      } catch {
        if (id === latest.current) setResults([]);
      } finally {
        if (id === latest.current) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, active, intent]);

  return (
    <div className="flex flex-col gap-5">
      {/* The box is the field; the input inside is only its text area, so the
          ring lands here. See focus.css for why a wrapper must opt its input
          out.

          `advField("boxed")` rather than the same four token values typed out
          again: this box has to stay the same shape as every other field, and
          this branch already proved that a copy does not. The geometry moved
          three times while it was being built, and each move needed both this
          file and adv-field.ts edited in lockstep, with nothing but attention
          keeping them together. A few of the classes it emits — the
          `placeholder:` and `disabled:` ones — cannot match on a `<div>` and
          are simply inert; that is the cheaper half of the trade. */}
      <div
        className={`${advField("boxed")} flex items-center gap-2.5 focus-within:shadow-[var(--focus-ring-field)]`}
      >
        <Search
          className="size-[15px] shrink-0 text-[var(--ink-600)]"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <input
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search by school"
          aria-label="Search for your program"
          autoFocus
          className="h-full w-full bg-transparent text-[13px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-400)]"
          data-focus-ring="none" /* the box above carries it */
        />
        {loading && (
          <Loader2
            className="size-3.5 shrink-0 animate-spin text-[var(--ink-400)]"
            aria-hidden="true"
          />
        )}
      </div>

      {active && visible.length > 0 && (
        <ul className="overflow-hidden rounded-[var(--radius-element)] border border-[var(--border-medium)] bg-[var(--surface-card)]">
          {visible.map((program) => {
            // The player intent gets one word or none. "On Advantage" says the
            // program is here without saying who brought it, and an unclaimed
            // program says nothing at all — a blank cell reveals nothing, where
            // even "no one yet" would confirm the program is unowned to anyone
            // willing to type a school name.
            const redacted = "onAdvantage" in program;
            const taken = redacted
              ? program.onAdvantage
              : program.status !== "unclaimed";
            return (
              <li
                key={program.programKey}
                className="border-t border-[var(--border-hairline)] first:border-t-0"
              >
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      intent === "join"
                        ? `/claim/${program.programKey}/request`
                        : `/claim/${program.programKey}`
                    )
                  }
                  className={`${ROW_GRID} w-full cursor-pointer px-4 py-3 text-left transition-colors duration-[var(--duration-fast)] hover:bg-[var(--surface-page)] focus-visible:bg-[var(--surface-page)] focus-visible:outline-none`}
                >
                  <span className="truncate text-[13px] text-[var(--ink-900)]">
                    {program.schoolName}
                  </span>
                  <span className="text-body-sm">
                    {teamLabel(program.team)}
                  </span>
                  <span className="text-body-sm truncate">
                    {programSubtitle(program.division, program.conference)}
                  </span>

                  {/* For a coach, the whole point of the list: it says which
                      programs are already claimed, and by whom, before anyone
                      commits to a row. For a player, design 4.1's one word. */}
                  <span className="text-micro truncate sm:text-right">
                    {redacted
                      ? taken
                        ? "On Advantage"
                        : null
                      : taken
                        ? (program.ownerDisplay ?? "Set up")
                        : "not set up"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {active && searched && !loading && visible.length === 0 && (
        <p className="text-body-sm">Nothing matched that.</p>
      )}

      {/* Persistent, not a last resort at the bottom of an empty result. It
          must never feel like an error when it happens.

          The two intents need different exits, because the two people can do
          different things about a missing program. A coach can vouch for one,
          so they get the form that files it. A player cannot verify their own
          program, so a form would only collect a request nobody can action —
          design 4.3 sends them to a link they can paste to their coach
          instead. The typed term rides along so that screen can name the
          school rather than say "your program". */}
      {intent === "join" ? (
        <p className="text-micro">
          <Link
            href={
              query
                ? `/claim/program/referral?school=${encodeURIComponent(query)}`
                : "/claim/program/referral"
            }
            className="text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
          >
            My school isn&#39;t listed
          </Link>
        </p>
      ) : (
        <p className="text-micro">
          Can&#39;t find it?{" "}
          <Link
            href="/claim/program/new"
            className="text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
          >
            Tell us the program
          </Link>{" "}
          and we&#39;ll add it.
        </p>
      )}
    </div>
  );
}
