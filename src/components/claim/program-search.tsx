"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import type { ProgramSearchResult } from "@/lib/data/programs-server";
import { teamLabel, programSubtitle } from "@/lib/data/programs-server";

/** Long enough to stop typing, short enough not to feel laggy. */
const DEBOUNCE_MS = 180;

/**
 * What picking a row means.
 *
 * `claim` is the coach's path and the default, so every existing caller keeps
 * today's behaviour. `join` is the player's: they land on the invite request
 * rather than the status page, because the status page's unclaimed branch leads
 * with "Set up this program" and a player must never be routed at that.
 */
export type SearchIntent = "claim" | "join";

export function ProgramSearch({ intent = "claim" }: { intent?: SearchIntent }) {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<ProgramSearchResult[]>([]);
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
        const res = await fetch(
          `/api/programs/search?q=${encodeURIComponent(query)}`
        );
        const body = (await res.json()) as { results: ProgramSearchResult[] };
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
  }, [query, active]);

  return (
    <div>
      <div className="flex items-center gap-2.5 rounded-[10px] border border-[var(--border-medium)] bg-[var(--surface-card)] px-3.5 focus-within:border-[var(--ink-900)]">
        <Search
          className="size-[15px] shrink-0 text-[var(--ink-400)]"
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
          className="h-11 w-full bg-transparent text-[14px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-400)]"
        />
        {loading && (
          <Loader2
            className="size-3.5 shrink-0 animate-spin text-[var(--ink-400)]"
            aria-hidden="true"
          />
        )}
      </div>

      {active && visible.length > 0 && (
        <ul className="mt-2 overflow-hidden rounded-[10px] border border-[var(--border-hairline)] bg-[var(--surface-card)]">
          {visible.map((program) => {
            const taken = program.status !== "unclaimed";
            return (
              <li key={program.programKey}>
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      intent === "join"
                        ? `/claim/${program.programKey}/request`
                        : `/claim/${program.programKey}`
                    )
                  }
                  className="flex w-full items-center gap-4 border-b border-[var(--border-hairline)] px-4 py-3 text-left transition-colors duration-150 last:border-b-0 hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)] focus-visible:outline-none cursor-pointer"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-[var(--ink-900)]">
                      {program.schoolName}{" "}
                      <span className="text-[var(--ink-500)]">
                        {teamLabel(program.team)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-[var(--ink-500)]">
                      {programSubtitle(program.division, program.conference)}
                    </span>
                  </span>

                  {/* The whole point of the list: it says which programs are
                      already claimed before anyone commits to a row. */}
                  <span
                    className={`shrink-0 text-[11px] ${
                      taken ? "text-[var(--ink-700)]" : "text-[var(--ink-400)]"
                    }`}
                  >
                    {taken
                      ? (program.ownerDisplay ?? "Set up")
                      : intent === "join"
                        ? "no one yet"
                        : "not set up"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {active && searched && !loading && visible.length === 0 && (
        <p className="mt-3 text-[12px] text-[var(--ink-500)]">
          Nothing matched that.
        </p>
      )}

      {/* Persistent, not a last resort at the bottom of an empty result. All
          1,940 teams are in the directory now, so this is the rare path — but
          it must never feel like an error when it happens. */}
      <p className="mt-4 text-[12px] text-[var(--ink-500)]">
        Can&#39;t find it?{" "}
        <Link
          href="/claim/program/new"
          className="text-[var(--blue)] underline decoration-[var(--blue)]/30 underline-offset-2 hover:decoration-[var(--blue)]"
        >
          Tell us the program
        </Link>{" "}
        and we&#39;ll add it.
      </p>
    </div>
  );
}
