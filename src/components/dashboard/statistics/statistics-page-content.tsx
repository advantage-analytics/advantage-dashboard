"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { StatisticsMatch } from "@/lib/data/statistics";
import type { StatisticsPoint } from "@/lib/data/statistics-server";
import { StatisticsBody } from "./statistics-body";
import {
  StatisticsProvider,
  type StatisticsContextValue,
} from "./statistics-provider";
import {
  applyStatisticsFilters,
  parseStatisticsSearch,
  serializeStatisticsSearch,
  type StatisticsSearchState,
} from "./statistics-search";

/**
 * The populated Statistics page below its title row.
 *
 * The one component on the page that touches the URL. It reads the query
 * string, parses it once (`parseStatisticsSearch`), computes the filtered
 * set once (`applyStatisticsFilters`) and hands both to every region through
 * `StatisticsProvider`. Nothing is kept in state: a filter change is a
 * `router.replace` of the serialized params, the URL changes, and this
 * re-renders from it — so Back, a reload and a pasted link all agree with
 * what is on screen.
 *
 * `replace`, not `push`: stepping a rolling window through four values
 * should not cost four presses of Back to leave the page. `scroll: false`
 * because the controls a later task adds sit above the regions they change.
 */
export function StatisticsPageContent({
  matches,
  points,
}: {
  /** Every analyzed match, oldest → newest (`getPersonalStatistics`). */
  matches: StatisticsMatch[];
  /** Their points, or `null` when that read failed. */
  points: StatisticsPoint[] | null;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  // Keyed on the string: the hook's object is a new one per navigation, the
  // query it holds usually is not.
  const query = searchParams.toString();
  const state = useMemo(
    () => parseStatisticsSearch(new URLSearchParams(query)),
    [query],
  );
  const filtered = useMemo(
    () => applyStatisticsFilters(matches, state),
    [matches, state],
  );

  const setState = useCallback(
    (patch: Partial<StatisticsSearchState>) => {
      const next = serializeStatisticsSearch({ ...state, ...patch });
      router.replace(next ? `${pathname}?${next}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, state],
  );

  const value = useMemo<StatisticsContextValue>(
    () => ({ all: matches, filtered, points, state, setState }),
    [matches, filtered, points, state, setState],
  );

  return (
    <StatisticsProvider value={value}>
      <StatisticsBody />
    </StatisticsProvider>
  );
}
