"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProgramSearchResult } from "@/lib/data/programs-server";

/**
 * The directory search behind every "which school?" question the schedule
 * asks — `/api/programs/search`, debounced and aborted per keystroke.
 *
 * Extracted from `dual-school-step.tsx` so the score page's tournament round
 * can ask the same question against the same source instead of growing a
 * second search. The rules are the step's own, unchanged: two characters is
 * the floor (the route enforces it too, so asking earlier is a wasted round
 * trip), 180ms of quiet before the request goes out, and the previous request
 * is aborted rather than raced — the route is cached for five minutes, but a
 * request per character still queues them.
 *
 * Under the floor the answer is an empty list in the same render, not a tick
 * later: a list that lingered after the term was cleared would offer schools
 * for a search that no longer exists.
 */
export function useProgramSearch(term: string): ProgramSearchResult[] {
  const [results, setResults] = useState<ProgramSearchResult[]>([]);
  const query = term.trim();

  useEffect(() => {
    // Clearing below the threshold is derived below, not set here — a
    // synchronous setState in this effect cascades a render per keystroke.
    if (query.length < 2) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/programs/search?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        if (!response.ok) return;
        const body = (await response.json()) as {
          results: ProgramSearchResult[];
        };
        setResults(body.results);
      } catch {
        // An aborted fetch is the normal case here, not a failure worth showing.
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return useMemo(() => (query.length < 2 ? [] : results), [query, results]);
}
