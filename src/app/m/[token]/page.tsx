import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ClaimActions, CLAIM_BUTTON } from "@/components/claim/claim-shell";
import { JoinPane } from "@/components/join/join-pane";
import { MatchDataProvider } from "@/components/dashboard/matches/match-data-provider";
import {
  MatchReportFrame,
  MatchReportPane,
  MatchReportProvider,
  MatchReportRail,
  MatchReportSpacer,
  MatchReportWhen,
} from "@/components/dashboard/matches/match-detail/match-report";
import { MatchReportScoreboard } from "@/components/dashboard/matches/match-detail/report-scoreboard";
import {
  MatchReportTitle,
  MatchReportTitleRow,
} from "@/components/dashboard/matches/match-detail/report-title-row";
import { MatchReportFacts } from "@/components/dashboard/matches/match-detail/report-facts";
import { StatisticsView } from "@/components/dashboard/matches/match-detail/statistics-view";
import { SharedByFooter } from "@/components/public/shared-by-footer";
import { DEFAULT_BANDS } from "@/lib/data/viz-bands";
import { MatchReportPending } from "@/components/dashboard/loading/match-report-pending";
import { getSharedMatchData } from "@/lib/data/match-share-server";
import { formatScoreText, playedSets } from "@/lib/ui/score-format";

/**
 * A match report anyone with the link can read (`/m/[token]`).
 *
 * The same report the sharer sees under `/dashboard/matches/[matchId]`, built
 * from the same parts — the rail scoreboard, the title row, the Statistics
 * view — under `MatchReportProvider readOnly`. What is left out is everything
 * that acts or leads back into the app: Share, Compare, the More menu (review
 * score, delete), the view switcher, the Visualizations and Video views
 * (the video is a short-lived signed URL, and bookmarks write), and the
 * awaiting-analysis progress with its retry. A match still analysing draws
 * the scoreboard and an empty Statistics view rather than a pipeline state.
 *
 * `force-dynamic`: the answer depends on a row that is deleted the moment the
 * sharer turns the link off. Unknown, mistyped and revoked tokens all land on
 * one screen, so a bad token cannot learn whether it was ever a good one.
 * `robots: noindex` — a share link is for the people it was sent to.
 */
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

async function load(rawToken: string) {
  return getSharedMatchData(decodeURIComponent(rawToken));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { token } = await params;
  const data = await load(token);
  if (!data) {
    return {
      title: "Match report · Advantage",
      robots: { index: false, follow: false },
    };
  }
  const { match } = data;
  const title = `${match.player1.name} vs ${match.player2.name} · Advantage`;
  const score = formatScoreText(playedSets(match.score.sets));
  const description = [score, match.date, match.tournamentName]
    .filter((part) => part && part.trim())
    .join(" · ");
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SharedMatchPage({ params }: PageProps) {
  const { token } = await params;
  const data = await load(token);

  if (!data) {
    return (
      <JoinPane
        width={440}
        eyebrow="Match report"
        title="That link isn't valid"
        body="It may have been turned off by whoever shared it. Ask them for a new one."
      >
        <ClaimActions>
          <Link href="/login" className={CLAIM_BUTTON}>
            Go to Advantage
          </Link>
        </ClaimActions>
      </JoinPane>
    );
  }

  const { match, statsResult, points, summary, sharedBy } = data;
  const p1 = statsResult?.statistics?.player1Stats;
  const p2 = statsResult?.statistics?.player2Stats;
  const statsPublished = Boolean(p1 && p2);
  const isDerived = match.sourceProvider === "splitstep";

  return (
    <MatchDataProvider
      key={match.id}
      match={match}
      statsResult={statsResult}
      points={points}
    >
      {/* `MatchReportProvider` reads `useSearchParams`, which needs a
          Suspense boundary above it on a page that is not itself a client
          component. */}
      <Suspense fallback={<MatchReportPending view="statistics" />}>
        <MatchReportProvider
          matchId={match.id}
          summary={summary}
          canCompare={false}
          isDerived={isDerived}
          statsPublished={statsPublished}
          hasPlayableVideo={false}
          savedViews={[]}
          workspaceRole="player"
          workspaceKind="personal"
          workspaceName=""
          bandSettings={DEFAULT_BANDS}
          canEditBands={false}
          unit="ft"
          defaultView="statistics"
          readOnly
        >
          <MatchReportFrame>
            <MatchReportRail>
              <MatchReportScoreboard />
              <MatchReportSpacer />
              <SharedByFooter sharedBy={sharedBy} />
            </MatchReportRail>

            <MatchReportPane>
              <MatchReportTitleRow>
                <div className="min-w-0">
                  <MatchReportTitle />
                  <MatchReportFacts />
                </div>
              </MatchReportTitleRow>

              <MatchReportWhen view="statistics">
                <StatisticsView />
              </MatchReportWhen>
            </MatchReportPane>
          </MatchReportFrame>
        </MatchReportProvider>
      </Suspense>
    </MatchDataProvider>
  );
}
