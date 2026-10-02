"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  adminSearchTeams,
  type AdminSearchResult,
} from "@/lib/data/admin-search-server";

/**
 * Jump to a team from anywhere in the admin console.
 *
 * The header's Search slot, filled. It is a popover with a live-filtering
 * input, not the dashboard's ⌘K command palette: the console searches one
 * thing, and a palette's verbs-and-nouns grammar would promise a breadth this
 * has no second entry for. Results are plain `Link`s, so a middle-click opens
 * a team in a new tab the way every other row in this console does.
 *
 * Each keystroke is debounced by 180ms and every reply is stamped with the
 * query that asked for it — a fast "UC" landing after a slow "U" would
 * otherwise repaint the list with the older answer.
 */

const DEBOUNCE_MS = 180;

export function AdminSearch() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  // Results carry the query they answer, so "still searching" is derived
  // rather than a second piece of state — a `loading` flag would have to be
  // raised synchronously inside the effect below, which is the cascading
  // render `react-hooks/set-state-in-effect` is there to catch.
  const [answered, setAnswered] = useState<{
    query: string;
    rows: AdminSearchResult[];
  }>({ query: "", rows: [] });
  const inputRef = useRef<HTMLInputElement>(null);
  // The query the newest request was issued for; a reply for anything else is
  // stale and dropped.
  const latest = useRef("");

  useEffect(() => {
    const query = term.trim();
    latest.current = query;
    if (query.length === 0) return;

    const timer = setTimeout(() => {
      void adminSearchTeams(query).then((rows) => {
        if (latest.current !== query) return;
        setAnswered({ query, rows });
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [term]);

  // Each opening starts empty — a console left open all day should not offer
  // yesterday's search as if it were current.
  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setTerm("");
      setAnswered({ query: "", rows: [] });
    }
  };

  const query = term.trim();
  const loading = answered.query !== query;
  const results = loading ? [] : answered.rows;

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-expanded={open}
          className="flex h-7 cursor-pointer items-center gap-1.5 rounded-[var(--radius-element)] px-2 transition-colors duration-200 hover:bg-[var(--surface-subtle)]"
        >
          <Search
            className="size-3.5 text-[var(--ink-500)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <span className="text-[12px] text-[var(--ink-600)]">Search</span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={6}
        collisionPadding={12}
        aria-label="Search teams"
        className="w-[320px] p-1.5"
        onOpenAutoFocus={(event) => {
          // Focus the field, not the panel — the point of opening this is to
          // type.
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <input
          ref={inputRef}
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search teams"
          aria-label="Search teams"
          className="h-8 w-full rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-2.5 text-[12px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-400)]"
        />

        {query.length > 0 && (
          <div className="mt-1 flex flex-col">
            {results.length === 0 ? (
              <p className="px-2.5 py-3 text-[12px] text-[var(--ink-500)]">
                {loading ? "Searching…" : `No team matches “${query}”`}
              </p>
            ) : (
              results.map((result) => (
                <Link
                  key={result.id}
                  href={`/admin/teams/${result.id}`}
                  onClick={() => changeOpen(false)}
                  className="flex flex-col rounded-[7px] px-2.5 py-[7px] transition-colors duration-100 hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)] focus-visible:outline-none"
                >
                  <span className="truncate text-[12px] text-[var(--ink-900)]">
                    {result.name}
                  </span>
                  {result.subtitle ? (
                    <span className="mt-0.5 truncate text-[11px] text-[var(--ink-500)]">
                      {result.subtitle}
                    </span>
                  ) : null}
                </Link>
              ))
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
