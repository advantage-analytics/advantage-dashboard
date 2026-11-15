"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { track } from "@/lib/analytics";
import { vizFilterChanges } from "./viz-analytics";

/**
 * `filter_changed` for the Visualizations controls, read off the URL they
 * write to (`viz-analytics.ts` says what is and is not sent).
 *
 * Only a change made while the page is open counts: the URL a visit arrives
 * with is where it started, not something the reader did. `scope` is whatever
 * the URL belongs to (a match id, a roster player id); when it changes the
 * next URL is a new start, so moving between two players' pages does not read
 * as every filter moving at once.
 */
export function useVizFilterAnalytics(
  view: "match_report" | "player_profile",
  scope: string,
  enabled = true,
): void {
  const query = useSearchParams().toString();
  const last = useRef<{ scope: string; query: string } | null>(null);
  useEffect(() => {
    const before = last.current;
    last.current = { scope, query };
    if (!enabled || !before || before.scope !== scope) return;
    if (before.query === query) return;
    const changes = vizFilterChanges(
      new URLSearchParams(before.query),
      new URLSearchParams(query),
    );
    for (const change of changes) track("filter_changed", { view, ...change });
  }, [view, scope, query, enabled]);
}
