"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { addTeamToConference } from "@/lib/services/programs/admin-conference-actions";
import {
  adminSearchTeams,
  type AdminSearchResult,
} from "@/lib/data/admin-search-server";
import type { AdminConferenceRow } from "@/lib/data/admin-conferences-view";

/** The header search's own debounce. */
const SEARCH_DEBOUNCE_MS = 180;

const SEARCH_ERROR = "Couldn't search teams.";

/**
 * "Add a team" — the admin header search's input and debounce, answering with
 * three kinds of row:
 *
 *   no conference         added at once; nothing is lost
 *   another conference    confirmed first — the team leaves that one
 *   this conference       "Already here", nothing to press
 *
 * Replies are stamped with the query that asked for them, as in
 * `admin-search.tsx`, so a slow early reply never repaints a later answer.
 */
export function AddTeamPopover({
  conference,
  onAdded,
}: {
  conference: AdminConferenceRow;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [answered, setAnswered] = useState<{
    query: string;
    rows: AdminSearchResult[];
  }>({ query: "", rows: [] });
  const [moving, setMoving] = useState<AdminSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const latest = useRef("");

  useEffect(() => {
    const query = term.trim();
    latest.current = query;
    if (query.length === 0) return;

    const timer = setTimeout(() => {
      adminSearchTeams(query)
        .then(
          (rows) => ({ rows, failed: false }),
          // A rejected search answers this query with nothing, so
          // "Searching…" ends, and says why.
          () => ({ rows: [] as AdminSearchResult[], failed: true }),
        )
        .then(({ rows, failed }) => {
          if (latest.current !== query) return;
          // A later search that works clears an earlier search failure, and
          // only that — an add's error stays.
          setError((current) =>
            failed ? SEARCH_ERROR : current === SEARCH_ERROR ? null : current,
          );
          setAnswered({ query, rows });
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [term]);

  const reset = () => {
    setTerm("");
    setAnswered({ query: "", rows: [] });
    setError(null);
  };

  const changeOpen = (next: boolean) => {
    if (!next && pending) return;
    setOpen(next);
    if (!next) reset();
  };

  const add = (team: AdminSearchResult, done?: () => void) => {
    start(async () => {
      setError(null);
      const result = await addTeamToConference(team.id, conference.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      done?.();
      setOpen(false);
      reset();
      onAdded();
    });
  };

  const query = term.trim();
  const loading = answered.query !== query;
  const results = loading ? [] : answered.rows;

  return (
    <>
      <Popover open={open} onOpenChange={changeOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-expanded={open}
            className="cursor-pointer rounded-[4px] text-[12px] font-medium whitespace-nowrap text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          >
            Add a team
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="end"
          sideOffset={6}
          collisionPadding={12}
          aria-label={`Add a team to ${conference.name}`}
          className="w-[320px] p-1.5"
          onOpenAutoFocus={(event) => {
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
                results.map((result) =>
                  result.conferenceId === conference.id ? (
                    <div
                      key={result.id}
                      className="flex items-center gap-2 rounded-[7px] px-2.5 py-[7px]"
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[12px] text-[var(--ink-600)]">
                          {result.name}
                        </span>
                        {result.subtitle ? (
                          <span className="mt-0.5 truncate text-[11px] text-[var(--ink-500)]">
                            {result.subtitle}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-[11px] text-[var(--ink-500)]">
                        Already here
                      </span>
                    </div>
                  ) : (
                    <button
                      key={result.id}
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        if (result.conferenceId) {
                          setError(null);
                          setOpen(false);
                          setMoving(result);
                        } else {
                          add(result);
                        }
                      }}
                      className="flex cursor-pointer flex-col rounded-[7px] px-2.5 py-[7px] text-left transition-colors duration-100 hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)] focus-visible:outline-none disabled:cursor-default disabled:opacity-60"
                    >
                      <span className="truncate text-[12px] text-[var(--ink-900)]">
                        {result.name}
                      </span>
                      {result.subtitle ? (
                        <span className="mt-0.5 truncate text-[11px] text-[var(--ink-500)]">
                          {result.subtitle}
                        </span>
                      ) : null}
                    </button>
                  ),
                )
              )}
            </div>
          )}

          {pending && !moving && (
            <p className="px-2.5 pt-1 pb-1.5 text-[11px] text-[var(--ink-500)]">
              Adding…
            </p>
          )}
          {error && !moving && (
            <p
              role="alert"
              className="px-2.5 pt-1 pb-1.5 text-[11px] leading-[1.5] text-[var(--danger)]"
            >
              {error}
            </p>
          )}
        </PopoverContent>
      </Popover>

      <ConfirmDialog
        open={moving !== null}
        onOpenChange={(next) => {
          if (next || pending) return;
          setMoving(null);
          setError(null);
          reset();
        }}
        title={
          moving ? `Move ${moving.name} to ${conference.name}?` : "Move team?"
        }
        description={
          moving?.conferenceLabel
            ? `It leaves ${moving.conferenceLabel} and joins ${conference.label}.`
            : `It joins ${conference.label}.`
        }
        confirmLabel="Move team"
        pendingLabel="Moving…"
        pending={pending}
        error={moving ? error : null}
        onConfirm={() => {
          const team = moving;
          if (!team) return;
          add(team, () => setMoving(null));
        }}
      />
    </>
  );
}
