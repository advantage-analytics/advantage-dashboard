import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { useSearchParams } from "next/navigation";
import { WidgetBoundary } from "@/components/dashboard/loading/widget-boundary";
import { ProfileVisualizationsView } from "@/components/dashboard/team/player-profile/profile-visualizations-view";
import { seasonErrorSplitJudged } from "@/lib/data/player-season";
import {
  buildSeasonCards,
  buildSeasonLightbox,
  buildSeasonViewCards,
  parseSeasonVizState,
  type SeasonVizMatch,
} from "@/lib/data/player-season-viz";
import { DEFAULT_BANDS } from "@/lib/data/viz-bands";
import type { MatchPoint } from "@/lib/data/match-points-server";
import type { SavedView } from "@/lib/data/saved-views-logic";
import { EMPTY_VIZ_FILTERS } from "@/components/dashboard/matches/match-detail/shots/viz-model";
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
 * makes it a season with nothing analyzed; `?p1serves=1` keeps only the
 * points the player served, so the opponents have no serve card (and the
 * player no returns card); `?nosaved=1` makes the workspace hold no saved
 * views (by default it holds two: "Second serves" and "Their rally shots");
 * `?video=1` gives the one match (played on Nov 3 against Jordan Lee) a
 * video, so a mark's second click opens its Video tab; `?hands=1` makes
 * the season three matches, each the same points under its own ids, whose
 * opponents play right (Jordan Lee, Nov 3), left (Sam Ortiz, Oct 20) and
 * unknown (Riley Park, Oct 6) — the profile's "Opponent plays" and
 * "Matches" filters.
 *
 * The view sits in the page's own `WidgetBoundary`, and the navigation
 * mock's `router.refresh()` re-renders this harness the way a refresh
 * re-renders the page — new children, so the boundary lets go of an error.
 *
 * `data-landed` names the last URL "the server" answered.
 */
const LOAD_PARAMS = new URLSearchParams(window.location.search);
const ALL_POINTS = [...ASYMMETRIC_SERVES, ...RALLY_POINTS];
/** The same points under another match's ids — mark ids are unique across
 *  a season, as real point and shot ids are. */
function prefixed(points: MatchPoint[], prefix: string): MatchPoint[] {
  return points.map((p) => ({
    ...p,
    id: `${prefix}:${p.id}`,
    shots: p.shots?.map((s) => ({ ...s, id: `${prefix}:${s.id}` })),
  }));
}
const HANDS_SEASON: SeasonVizMatch[] = [
  {
    matchId: "m-1",
    points: prefixed(ALL_POINTS, "m-1"),
    isPlayer1: true,
    isDerived: false,
    errorSplitJudged: true,
    date: "2026-11-03",
    opponent: "Jordan Lee",
    opponentHand: "right",
    won: true,
    score: "6–3, 6–4",
    courtType: "Outdoor Hard Court",
  },
  {
    matchId: "m-2",
    // Every other point, so each match draws a different count.
    points: prefixed(
      ALL_POINTS.filter((_, i) => i % 2 === 0),
      "m-2",
    ),
    isPlayer1: true,
    isDerived: false,
    errorSplitJudged: true,
    date: "2026-10-20",
    opponent: "Sam Ortiz",
    opponentHand: "left",
    won: false,
    score: "4–6, 6–7",
    courtType: "Clay Court",
  },
  {
    matchId: "m-3",
    points: prefixed(
      ALL_POINTS.filter((_, i) => i % 3 === 0),
      "m-3",
    ),
    isPlayer1: true,
    isDerived: false,
    errorSplitJudged: true,
    date: "2026-10-06",
    opponent: "Riley Park",
    opponentHand: null,
    won: true,
    score: "7–5, 6–2",
    courtType: "Indoor Hard Court",
  },
];
const SEASON: SeasonVizMatch[] = LOAD_PARAMS.has("empty")
  ? []
  : LOAD_PARAMS.has("hands")
    ? HANDS_SEASON
    : [
        {
          matchId: "m-1",
          points: LOAD_PARAMS.has("p1serves")
            ? ALL_POINTS.filter((point) => point.serverIsPlayer1)
            : ALL_POINTS,
          isPlayer1: true,
          isDerived: false,
          errorSplitJudged: true,
          date: "2026-11-03",
          opponent: "Jordan Lee",
          hasPlayableVideo: LOAD_PARAMS.has("video"),
        },
      ];
const BANDS = { bands: DEFAULT_BANDS, unit: "ft" as const };
const NAMES = { you: "Avery Kim", opponent: "Opponents" };
const DELAY_MS = Number(LOAD_PARAMS.get("delay") ?? 400);
const SAVED_VIEWS: SavedView[] = LOAD_PARAMS.has("nosaved")
  ? []
  : [
      {
        id: "v-second",
        name: "Second serves",
        cut: "serve",
        chart: "scatter",
        filters: { ...EMPTY_VIZ_FILTERS, ball: ["second"] },
        order: 0,
      },
      {
        id: "v-opp-rally",
        name: "Their rally shots",
        cut: "rallyPlacement",
        chart: "scatter",
        filters: { ...EMPTY_VIZ_FILTERS, player: "opponent" },
        order: 1,
      },
    ];

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
    savedCards: buildSeasonViewCards(SEASON, SAVED_VIEWS, BANDS),
    lightbox: buildSeasonLightbox(SEASON, state, BANDS, NAMES, SAVED_VIEWS),
    errorSplitJudged,
    // `?otherside=1`: the page's streamed other-side wall, landing a moment
    // after the answer, as `page.tsx` sends it.
    // On the wall only, as `page.tsx` streams it.
    ...(LOAD_PARAMS.has("otherside") && state.cut === null
      ? {
          otherSideCards: new Promise<ReturnType<typeof buildSeasonCards>>(
            (resolve) =>
              window.setTimeout(
                () =>
                  resolve(
                    buildSeasonCards(
                      SEASON,
                      side === "you" ? "opponent" : "you",
                      BANDS,
                    ),
                  ),
                50,
              ),
          ),
        }
      : {}),
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
  // `router.refresh()` from the boundary's Try again: the server renders
  // the page again for the same URL.
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    const onRefresh = () => setGeneration((n) => n + 1);
    window.addEventListener("harness-refresh", onRefresh);
    return () => window.removeEventListener("harness-refresh", onRefresh);
  }, []);
  return (
    <main
      className="p-6"
      data-landed={answer.query}
      data-generation={generation}
    >
      <WidgetBoundary label="Visualizations">
        <ProfileVisualizationsView
          playerName="Avery Kim"
          firstName="Avery"
          chipLabels={{ you: "Kim", opponent: "Opponents" }}
          analyzed={SEASON.length}
          {...answer.props}
        />
      </WidgetBoundary>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
