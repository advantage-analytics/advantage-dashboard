import { createRoot } from "react-dom/client";
import { MatchDataProvider } from "@/components/dashboard/matches/match-data-provider";
import { MatchReportProvider } from "@/components/dashboard/matches/match-detail/match-report-context";
import { ShotsTab } from "@/components/dashboard/matches/match-detail/shots/shots-tab";
import { MatchFiltersProvider } from "@/components/dashboard/matches/match-detail/match-filters/provider";
import { DEFAULT_BANDS } from "@/lib/data/viz-bands";
import type { Match } from "@/lib/data/types";
import {
  BASELINE,
  LOBBED,
  MATCH,
  OPP_APPROACH,
  PASSED_DTL,
  withoutLanding,
} from "./approach-points";

/**
 * The Visualizations tab as the report mounts it — the real `ShotsTab`, its
 * wall and the real `VizLightbox` — over the shared net-point match
 * (`approach-points.ts`): approaches, a serve and volley, a time drawn in.
 * You are player 1. `?hand=known` records both players as right-handed;
 * without it the opponent's hand is not on the match row, so the court's
 * wing words assume it (`handAssumed`). `?net=never` keeps only the points
 * you never came in on: a match with no approaches of yours to draw.
 * `?landing=none` takes every shot's landing off (real match 9e4d293e: the
 * approaches count, none can be drawn); `?landing=some` takes it off two of
 * your approaches only (`PASSED_DTL`, `LOBBED`), so the rest still draw.
 * `?video=1` gives the match a playable video (every fixture point has a
 * clip), so a second click on a mark or a Points row watches its point.
 */
const params = new URLSearchParams(window.location.search);
const handKnown = params.get("hand") === "known";
const landing = params.get("landing");
const video = params.get("video") === "1";
const NO_LANDING: ReadonlySet<string> = new Set([PASSED_DTL.id, LOBBED.id]);
const source = (
  params.get("net") === "never" ? [BASELINE, OPP_APPROACH] : MATCH
).map((point) =>
  landing === "none" || (landing === "some" && NO_LANDING.has(point.id))
    ? withoutLanding(point)
    : point,
);

const match = {
  id: "fixture",
  tournamentName: "Test match",
  date: "2026-09-23",
  matchType: "Singles",
  player1: {
    name: "Avery Kim",
    school: "West",
    ...(handKnown ? { hand: "right" } : {}),
  },
  player2: {
    name: "Blake Rivera",
    school: "East",
    ...(handKnown ? { hand: "right" } : {}),
  },
  isUserPlayer1: true,
  viewerIsYou: true,
  score: {
    sets: [{ player1: 6, player2: 4 }],
    winner: "player1",
    finalScore: "6-4",
  },
} as Match;

// One number per point, as a real match has.
const points = source.map((point, i) => ({ ...point, pointNumber: i + 1 }));

createRoot(document.getElementById("root")!).render(
  <MatchDataProvider match={match} statsResult={null} points={points}>
    <MatchFiltersProvider>
      <MatchReportProvider
        matchId="fixture"
        summary={null}
        isDerived={false}
        statsPublished={false}
        hasPlayableVideo={video}
        savedViews={[]}
        workspaceRole="owner"
        workspaceKind="personal"
        workspaceName="Personal"
        bandSettings={DEFAULT_BANDS}
        canEditBands={false}
        unit="m"
        readOnly={false}
      >
        <main className="mx-auto max-w-[1200px] p-6">
          <ShotsTab />
        </main>
      </MatchReportProvider>
    </MatchFiltersProvider>
  </MatchDataProvider>,
);
