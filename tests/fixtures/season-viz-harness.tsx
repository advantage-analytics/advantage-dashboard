import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { useSearchParams } from "next/navigation";
import { ProfileVisualizationsView } from "@/components/dashboard/team/player-profile/profile-visualizations-view";
import { seasonErrorSplitJudged } from "@/lib/data/player-season";
import {
  buildSeasonCards,
  buildSeasonLightbox,
  parseSeasonVizState,
  type SeasonVizMatch,
} from "@/lib/data/player-season-viz";
import { DEFAULT_BANDS } from "@/lib/data/viz-bands";
import { RALLY_POINTS } from "./viz-rally-points";
import { ASYMMETRIC_SERVES } from "./viz-serve-points";

/**
 * The team player profile's Visualizations tab as the page mounts it, with
 * the page's Server Component played by a timer: the view reads the URL
 * through the popstate-driven `next/navigation` mock, and every
 * `router.replace` the store makes is answered `delay` ms later with what
 * `page.tsx` would compute for that URL — the side, the cards, the lightbox
 * — exactly as the real round trip hands new props to a client tree that
 * keeps its state. `?delay=` (ms, default 400) is read once at load so a
 * spec can hold the "server" back long enough to look at the gap; `?empty=1`
 * makes it a season with nothing analyzed.
 *
 * `data-landed` names the last URL "the server" answered.
 */
const LOAD_PARAMS = new URLSearchParams(window.location.search);
const SEASON: SeasonVizMatch[] = LOAD_PARAMS.has("empty")
  ? []
  : [
      {
        matchId: "m-1",
        points: [...ASYMMETRIC_SERVES, ...RALLY_POINTS],
        isPlayer1: true,
        isDerived: false,
        errorSplitJudged: true,
      },
    ];
const BANDS = { bands: DEFAULT_BANDS, unit: "ft" as const };
const NAMES = { you: "Avery Kim", opponent: "Opponents" };
const DELAY_MS = Number(LOAD_PARAMS.get("delay") ?? 400);

/** What `page.tsx`'s Visualizations body hands the view for one URL. */
function serverRender(query: string) {
  const record: Record<string, string | string[]> = {};
  for (const [key, value] of new URLSearchParams(query)) {
    const prev = record[key];
    record[key] =
      prev === undefined
        ? value
        : [...(Array.isArray(prev) ? prev : [prev]), value];
  }
  const errorSplitJudged = seasonErrorSplitJudged(SEASON);
  const state = parseSeasonVizState(record, errorSplitJudged);
  const side = state.filters.player;
  return {
    side,
    cards: buildSeasonCards(SEASON, side, BANDS),
    lightbox: buildSeasonLightbox(SEASON, state, BANDS, NAMES),
    errorSplitJudged,
  };
}

function Harness() {
  const query = useSearchParams().toString();
  const [answer, setAnswer] = useState(() => ({
    query,
    props: serverRender(query),
  }));
  useEffect(() => {
    if (answer.query === query) return;
    const timer = window.setTimeout(
      () => setAnswer({ query, props: serverRender(query) }),
      DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [query, answer.query]);
  return (
    <main className="p-6" data-landed={answer.query}>
      <ProfileVisualizationsView
        playerName="Avery Kim"
        firstName="Avery"
        analyzed={SEASON.length}
        {...answer.props}
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
