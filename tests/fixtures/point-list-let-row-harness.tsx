import { createRoot } from "react-dom/client";

import { MatchDataProvider } from "@/components/dashboard/matches/match-data-provider";
import { PointList } from "@/components/dashboard/matches/match-detail/film/point-list";
import { INERT_FILM_LIST_FILTERS } from "@/components/dashboard/matches/match-detail/film/film-list-filters";
import { LET_ROW_LETS, LET_ROW_MATCH, LET_ROW_POINTS } from "./let-row-points";

/**
 * The Video tab's list with a replayed let (`letPoints`). `?filtered` hands
 * the list an applied cut, under which the let row steps aside.
 */
const query = new URLSearchParams(window.location.search);
const filtered = query.has("filtered");
// `?lets-only`: no counted points at all, only the let.
const points = query.has("lets-only") ? [] : LET_ROW_POINTS;
const filmFilters = filtered
  ? { ...INERT_FILM_LIST_FILTERS, savedOnly: true }
  : INERT_FILM_LIST_FILTERS;

createRoot(document.getElementById("root")!).render(
  <MatchDataProvider
    match={LET_ROW_MATCH}
    statsResult={null}
    points={points}
    letPoints={LET_ROW_LETS}
  >
    <PointList
      allPoints={points}
      visiblePoints={filtered ? points.slice(0, 2) : points}
      filmFilters={filmFilters}
      letPoints={LET_ROW_LETS}
      activePointId={null}
      activeStart={0}
      activeEnd={0}
      onSelect={() => {}}
      onToggleSaved={() => {}}
    />
  </MatchDataProvider>,
);

document.documentElement.dataset.hydrated = "true";
