import { cache, Suspense } from "react";
import { seasonPlayerChipLabels } from "@/components/dashboard/matches/match-detail/shots/player-chip-labels";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import {
  canUploadForProgram,
  isProgramStaff,
  type ProgramRole,
} from "@/lib/workspace/types";
import {
  getPlayerMatchSides,
  getPlayerProfile,
} from "@/lib/data/player-profile-server";
import {
  getPlayerSeason,
  getPlayerSeasonCourts,
  seasonOpponentCount,
} from "@/lib/data/player-season-server";
import {
  buildSeasonEvidence,
  seasonInsightSignature,
} from "@/lib/data/player-insight";
import { getRosterData } from "@/lib/data/team-roster-server";
import { getMyPlayerIds } from "@/lib/data/player-identity-server";
// The report frame's parts by their named exports: this is a Server
// Component, and dotting into a `"use client"` module's object (`MatchReport.
// Frame`) throws on the server — see `match-report.tsx`.
import {
  MatchReportFrame,
  MatchReportPane,
} from "@/components/dashboard/matches/match-detail/match-report";
import {
  MatchReportTitleActions,
  MatchReportTitleRow,
} from "@/components/dashboard/matches/match-detail/report-title-row";
import { ProfileHeaderSlot } from "@/components/dashboard/team/player-profile/profile-header-slot";
import { ProfileRail } from "@/components/dashboard/team/player-profile/profile-rail";
import {
  ProfileTitle,
  ProfileViewWhen,
} from "@/components/dashboard/team/player-profile/profile-frame";
import { ProfileActions } from "@/components/dashboard/team/player-profile/profile-actions";
import { ProfileBodySlot } from "@/components/dashboard/team/player-profile/profile-body-deferred";
import { ProfileStatisticsView } from "@/components/dashboard/team/player-profile/profile-statistics-view";
import {
  PROFILE_VIEW_PARAM,
  parseProfileView,
} from "@/components/dashboard/team/player-profile/profile-view";
import { ProfileVisualizationsView } from "@/components/dashboard/team/player-profile/profile-visualizations-view";
import {
  AnalyzedCountPending,
  ProfileStatisticsPanePending,
  ProfileVisualizationsPanePending,
} from "@/components/dashboard/loading/player-profile-pending";
import { WidgetBoundary } from "@/components/dashboard/loading/widget-boundary";
import {
  buildSeasonCards,
  buildSeasonLightbox,
  buildSeasonViewCards,
  parseSeasonVizState,
  type SeasonCard,
} from "@/lib/data/player-season-viz";
import { getSavedViews } from "@/lib/data/saved-views-server";
import { seasonErrorSplitJudged } from "@/lib/data/player-season";
import { getBandSettings } from "@/lib/data/viz-bands-server";
import { getPreferences } from "@/lib/data/preferences-server";
import { askEntryHref } from "@/lib/services/ask/entry";
import { otherPlayer } from "@/components/dashboard/matches/match-detail/match-filters/panel-draft";

/** `getPreferences` once per request, so the early start above and the
 *  Visualizations body share one read. */
const requestPreferences = cache(getPreferences);

/**
 * One player's page — Platform Audit `Te` (their own) and `Te2` (a coach's
 * view of it).
 *
 * Byte-for-byte the same page from both sides. A player's own data lives
 * here rather than in a personal workspace — that one is for people not on
 * a team — reached from their name at the foot of the rail; a coach reaches
 * the same page from the Roster. Two things differ, both chrome: the
 * **You** pill marks whose page it is; and the ghost button is **Edit
 * profile** (a player owns their identity) or **Edit player** (a coach owns
 * the roster). The header reads `Roster › name ⌄ 3 / 9` from either side —
 * the trail and the switcher are the same walk whoever is walking it. No
 * data is added or withheld — that is what "fully open" buys a program.
 *
 * The frame is the match report's (design Q, 2026-11): a 300px rail — who
 * they are, Statistics · Visualizations, links to their matches and
 * opponents, New match at the foot — and a scrolling pane whose title row
 * names the active view (`?tab=`, `profile-view.ts`), then the view's body.
 *
 * ── What waits for the season ───────────────────────────────────────────────
 * `getPlayerSeason` is the heavy read — every analyzed match's points, stats
 * rows and lob file — so nothing above the pane body awaits it. The rail and
 * the title row render from `getPlayerProfile` and `getPlayerMatchSides`,
 * which the profile read has already made (both `cache()`d, so the match
 * sides cost nothing more): "N matches" is the profile's count and "N
 * opponents" is `seasonOpponentCount` over the same rows the season would
 * count them from. Two things do need the season, and each streams inside
 * its own `<Suspense>`: the facts line's "N analyzed" (a bar until it lands)
 * and the two tabs' bodies (`ProfileStatisticsPanePending` and
 * `ProfileVisualizationsPanePending` until they land —
 * `player-profile-pending.tsx`, the same parts `loading.tsx` draws).
 *
 * ── The Visualizations tab and the URL ──────────────────────────────────────
 * The wall's side (`?player=`) and the opened card (`?cut=` and its filters,
 * `viz-url.ts`) are read from `searchParams`, and every card, summary and
 * lightbox figure is computed HERE from the season's points
 * (`player-season-viz.ts`), never in the browser: a season's points are
 * megabytes. A click in the wall or the lightbox writes the URL
 * (`VizStateProvider`'s `router.replace`), which renders this page again
 * with the new state. The URL's player is the wall's side on the wall and
 * the card's while one is open; the wall's own player is kept in the
 * browser meanwhile (`profile-visualizations-view.tsx`), and closing writes
 * it back, so the cards are recomputed for it then.
 *
 * ── One body per request ────────────────────────────────────────────────────
 * `?tab=` is read client-side for the switch (`ProfileViewWhen`, native
 * history, no server render) AND here, once, to decide which body to
 * render: the Statistics body on a Statistics request (the default URL),
 * the Visualizations body on `?tab=visualizations` — which is every viz
 * click, since the store keeps `tab`. Each costs what the other does not
 * need. The Visualizations body reads `getPlayerSeasonCourts` — the same
 * matches and points, but no ball-paths download (the courts never read
 * lobs, and that file is this page's one service-role read) and no
 * Statistics fold, evidence line or signature. The Statistics body reads
 * `getPlayerSeason` and skips the cards and the lightbox, which on a wall
 * of four courts over a season are the bulk of the RSC payload. A request
 * calls exactly one of the two season loaders (`AnalyzedCount` reads the
 * same one), so the points are read once either way.
 *
 * The body not rendered has a stand-in in its slot
 * (`profile-body-deferred.tsx`): nothing while the other view is up, and
 * when the reader switches to it, that view's skeleton and one soft
 * navigation to the URL it is at (`RefreshOnMount`, not `router.refresh()`,
 * which fell back to a full document load), whose render carries the body —
 * one round trip, the one a first load of that view would cost. The two
 * cannot ping-pong: a stand-in is shown only while its own view is the URL's,
 * and that URL's render carries its body, not another stand-in it would show.
 *
 * That skeleton is shown once per view per visit, not once per switch: each
 * slot is a `ProfileBodySlot`, which keeps the last body it was handed and
 * shows it again when a later request rendered the other view (the
 * Visualizations body only while the URL's viz state is the one it was
 * rendered for). A switch back to a view already seen is instant, and asks
 * for the page again in the background so a body that went stale meanwhile
 * is replaced rather than trusted — `profile-body-deferred.tsx`.
 *
 * ── Why the numbers match the roster's ──────────────────────────────────────
 * `getPlayerProfile` folds both of a claimed player's ids the way
 * `getRosterData` does, so the Record here is the roster's Record. Both
 * loaders are `cache()`d; the roster read is shared with the header's
 * switcher and Edit player, which need the whole squad.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ playerId: string }>;
}): Promise<Metadata> {
  const { playerId } = await params;
  const workspace = await getWorkspaceContext();
  if (!workspace || workspace.active.kind !== "team")
    return { title: "Player" };
  const profile = await getPlayerProfile(workspace.active.id, playerId);
  return { title: profile?.name ?? "Player" };
}

export default async function PlayerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ playerId }, query] = await Promise.all([params, searchParams]);

  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active } = workspace;
  if (active.kind !== "team") redirect("/dashboard");

  // A Visualizations request starts its body's reads now, alongside the
  // profile's own, instead of after them: every one is `cache()`d, so the
  // body below awaits these same promises. On a filter click (each one is a
  // round trip through this page) that takes a whole wave of reads off the
  // critical path. `.catch` only marks the early promise handled; the body
  // still sees, and throws, any failure.
  if (parseProfileView(query[PROFILE_VIEW_PARAM]) === "visualizations") {
    for (const early of [
      getPlayerSeasonCourts(active.id, playerId),
      getBandSettings(active.id),
      requestPreferences(),
      getSavedViews(active.id),
    ])
      early.catch(() => {});
  }

  const [profile, roster, myPlayerIds, sides] = await Promise.all([
    getPlayerProfile(active.id, playerId),
    getRosterData(active.id),
    getMyPlayerIds(),
    // The rows `getPlayerProfile` itself reads (`cache()`d, one roster RPC
    // and one matches read per request) — what the rail's opponents count is
    // taken from without waiting for the season. Null exactly when the
    // profile is.
    getPlayerMatchSides(active.id, playerId),
  ]);

  // The loader returns null for an id that names nobody on this roster. It
  // arrives from a URL, so it is untrusted; a 404 is the honest answer.
  if (!profile) notFound();

  // Both id eras count: the URL may carry the profile id or, for a claimed
  // player's old links, the user id. `getMyPlayerIds` knows both.
  const isSelf = myPlayerIds.includes(playerId);
  const isStaff = isProgramStaff(active);
  const canUpload = canUploadForProgram(active);

  // A staff member on their own row is still "self": the page is about them.
  // A player on a teammate's page is a viewer — they read it, and nothing
  // here is theirs to edit.
  const mode = isSelf ? "self" : isStaff ? "staff" : "viewer";

  const players = roster.members
    .filter((m) => m.role === "player")
    .map((m) => ({ id: m.playerId, name: m.name, lineupSpot: m.lineupSpot }));

  // Only staff can open Edit player, and only they need the squad behind it.
  // Everyone else gets nulls, which keeps a fat `RosterMember[]` out of the
  // page's client payload — see `ProfileActions`.
  const member =
    mode === "staff"
      ? (roster.members.find((m) => m.playerId === playerId) ?? null)
      : null;

  // `profile.playerId`, never the URL's: a claimed player's old links carry
  // their user id, and the wizard's For field wants the profile id. Gated by
  // `canUploadForProgram`, the predicate the wizard itself enforces — absent
  // rather than disabled, so this never opens a door the next page closes.
  const newMatchHref = canUpload
    ? `/dashboard/matches/new?player=${profile.playerId}`
    : null;

  // `getPlayerSeason` folds the same list, so its `matchesPlayed` and
  // `opponentsCount` are these two numbers; reading them here keeps the rail
  // off the season's critical path. Neither counts a practice session, and a
  // teammate is never an opponent faced (`countedSides`, `seasonOpponentCount`).
  const matchesPlayed = profile.matchesPlayed;
  const opponentsCount = sides ? seasonOpponentCount(sides.own) : 0;

  // Which body this request is for (see "One body per request"): the courts
  // on `?tab=visualizations`, the Statistics otherwise.
  const courtsOnly =
    parseProfileView(query[PROFILE_VIEW_PARAM]) === "visualizations";

  return (
    // The match detail layout's box: a fixed height from the viewport, so
    // the rail and the pane scroll on their own (`match-report.tsx`'s note).
    <div className="flex h-[calc(100dvh-var(--header-h))] w-full flex-col overflow-hidden bg-white">
      {/* `Roster › Name ⌄ n / N` for every viewer, the player included: the
          trail back to the roster and the switcher to walk it are the same
          from either side, and a player's own name alone left them with no
          way back to the squad. */}
      <ProfileHeaderSlot
        name={profile.name}
        playerId={profile.playerId}
        players={players}
      />

      <MatchReportFrame>
        <ProfileRail
          profile={profile}
          isSelf={isSelf}
          // The viewer's own from the workspace (fresh after a Profile
          // change); anyone else's from the roster row this page already read.
          photoUrl={
            isSelf
              ? workspace.viewer.avatarUrl
              : (roster.members.find((m) => m.playerId === profile.playerId)
                  ?.avatarUrl ?? null)
          }
          matchesCount={matchesPlayed}
          opponentsCount={opponentsCount}
          newMatchHref={newMatchHref}
        />

        <MatchReportPane>
          <MatchReportTitleRow>
            <div className="min-w-0">
              <ProfileTitle />
              {/* `.text-micro` is unlayered and paints ink-500, so the
                  report facts line's ink-700 goes inline. */}
              <p
                className="text-micro tabular mt-[9px] flex min-h-[18px] items-center gap-1"
                style={{ color: "var(--ink-700)" }}
              >
                <span>
                  {matchesPlayed} {matchesPlayed === 1 ? "match" : "matches"}
                </span>
                <Suspense fallback={<AnalyzedCountPending />}>
                  <AnalyzedCount
                    programId={active.id}
                    playerId={playerId}
                    courtsOnly={courtsOnly}
                  />
                </Suspense>
              </p>
            </div>
            <MatchReportTitleActions>
              <ProfileActions
                mode={mode}
                member={member}
                roster={mode === "staff" ? roster.members : []}
                // Ask with this player tagged (`profile.playerId`, the
                // roster's own id, which the Ask page's player tags carry).
                askHref={askEntryHref(
                  {
                    kind: "team",
                    programId: active.id,
                    programName: active.name,
                  },
                  { kind: "player", id: profile.playerId },
                )}
                askSubject={profile.firstName}
              />
            </MatchReportTitleActions>
          </MatchReportTitleRow>

          {/* The pane body: the one place the season is awaited for the
              cards. `WidgetBoundary` outside the `Suspense`, so a season read
              that throws (it fails closed — `player-season-server.ts`) draws
              the retry in the body while the rail and title stay. One body
              per request: the other view's slot holds its stand-in, which
              asks for the body when it is shown (`profile-body-deferred.tsx`). */}
          <WidgetBoundary label="Statistics">
            <ProfileBodySlot
              view="statistics"
              scope={active.id}
              body={
                courtsOnly ? null : (
                  <Suspense
                    fallback={
                      <ProfileViewWhen view="statistics">
                        <ProfileStatisticsPanePending />
                      </ProfileViewWhen>
                    }
                  >
                    <ProfileStatisticsBody
                      programId={active.id}
                      playerId={playerId}
                      rosterPlayerId={profile.playerId}
                      playerName={profile.name}
                      firstName={profile.firstName}
                    />
                  </Suspense>
                )
              }
            />
          </WidgetBoundary>
          <WidgetBoundary label="Visualizations">
            <ProfileBodySlot
              view="visualizations"
              scope={active.id}
              body={
                courtsOnly ? (
                  <Suspense
                    fallback={
                      <ProfileViewWhen view="visualizations">
                        <ProfileVisualizationsPanePending />
                      </ProfileViewWhen>
                    }
                  >
                    <ProfileVisualizationsBody
                      programId={active.id}
                      playerId={playerId}
                      playerName={profile.name}
                      firstName={profile.firstName}
                      isSelf={isSelf}
                      workspaceName={active.name}
                      workspaceRole={active.role}
                      query={query}
                    />
                  </Suspense>
                ) : null
              }
            />
          </WidgetBoundary>
        </MatchReportPane>
      </MatchReportFrame>
    </div>
  );
}

/**
 * The facts line's "· N analyzed", once the season has landed. A season read
 * that fails is the body's to report (its retry); here it drops the clause
 * rather than print a count nobody measured. Reads the loader the body of
 * this request reads (`courtsOnly`), so the season is read once.
 */
async function AnalyzedCount({
  programId,
  playerId,
  courtsOnly,
}: {
  programId: string;
  playerId: string;
  courtsOnly: boolean;
}) {
  const season = await (
    courtsOnly
      ? getPlayerSeasonCourts(programId, playerId)
      : getPlayerSeason(programId, playerId)
  ).catch(() => null);
  if (!season) return null;
  return <span>· {season.analyzed} analyzed</span>;
}

/**
 * The Statistics tab's body: the season, awaited here and nowhere above, then
 * `ProfileStatisticsView` inside the tab's panel. Null season is an id that
 * names nobody, which the page has already 404ed on.
 *
 * The insight card's evidence line and cache signature are composed here,
 * on the server, from the season fold (`player-insight.ts`): the figures the
 * card shows under the streamed claim are the same objects the Head to head
 * table draws, never the model's. `rosterPlayerId` is the roster's own id,
 * which is what `/api/player-insight` resolves.
 */
async function ProfileStatisticsBody({
  programId,
  playerId,
  rosterPlayerId,
  playerName,
  firstName,
}: {
  programId: string;
  playerId: string;
  rosterPlayerId: string;
  playerName: string;
  firstName: string;
}) {
  const season = await getPlayerSeason(programId, playerId);
  if (!season) return null;
  return (
    <ProfileViewWhen view="statistics">
      <ProfileStatisticsView
        playerId={rosterPlayerId}
        playerName={playerName}
        firstName={firstName}
        analyzed={season.analyzed}
        groups={season.groups}
        tallies={season.tallies}
        evidence={buildSeasonEvidence(season)}
        insightSignature={seasonInsightSignature(season)}
      />
    </ProfileViewWhen>
  );
}

/**
 * The Visualizations tab's body, rendered on a Visualizations request alone
 * ("One body per request"): the courts' season (`getPlayerSeasonCourts` —
 * the points, no lob files, no fold; `cache()`d, so `AnalyzedCount` shares
 * it), the workspace's bands and the viewer's unit, then the wall's four
 * cards for the URL's side and — when `?cut=` names one — the opened card's
 * court, statistics, per-row mark positions and per-option counts, all computed
 * here (`player-season-viz.ts`) and handed to the client view as plain data.
 * The Saved collection is the workspace's saved views (`getSavedViews`,
 * RLS-scoped: the viewer's private views and the program's shared ones),
 * each folded over the season the same way. No `MatchPoint` leaves this
 * function.
 */
async function ProfileVisualizationsBody({
  programId,
  playerId,
  playerName,
  firstName,
  isSelf,
  workspaceName,
  workspaceRole,
  query,
}: {
  programId: string;
  playerId: string;
  playerName: string;
  firstName: string;
  /** The viewer is this player: the player switch says "You". */
  isSelf: boolean;
  /** The program's name, for the Save dialog's "Share with team" row. */
  workspaceName: string;
  /** The viewer's role in the program: who may rename or delete a view. */
  workspaceRole: ProgramRole;
  query: Record<string, string | string[] | undefined>;
}) {
  const [season, bandSettings, preferences, savedViews] = await Promise.all([
    getPlayerSeasonCourts(programId, playerId),
    getBandSettings(programId),
    requestPreferences(),
    getSavedViews(programId),
  ]);
  if (!season) return null;
  const bands = { bands: bandSettings, unit: preferences.unit };
  // The season's own Error-type rule, read here and handed to the client
  // store too, so a `?verr=` parses the same on both ends: on an unjudged
  // season `unforced` opens on every error here AND in the browser.
  const errorSplitJudged = seasonErrorSplitJudged(season.perMatch);
  const state = parseSeasonVizState(query, errorSplitJudged);
  // The side the cards are computed for: the URL's player. On the wall that
  // is the wall's; while a card is open it is the card's — the wall's own
  // player is kept in the browser meanwhile (`profile-visualizations-view.tsx`)
  // and closing writes it back here, so the cards are recomputed for it.
  const side = state.filters.player;
  // The player switch's two words, and the subject word of an opened card's
  // subtitle: "You" only when the viewer is this player.
  const chipLabels = seasonPlayerChipLabels(playerName, isSelf);
  // The other side's wall, streamed behind the page (a promise prop): the
  // timer lets this answer go out first, and once it lands the wall's
  // You | Opponent swaps sides in the browser with no round trip
  // (`profile-visualizations-view.tsx`).
  // Only on the wall: while a card is open the wall is hidden and every
  // filter click is a round trip, so streaming the other side there would
  // ship a whole second wall per click for nothing. Closing the card
  // re-renders the wall, and the stream comes with it.
  const otherSideCards =
    state.cut === null
      ? new Promise<SeasonCard[]>((resolve, reject) =>
          setTimeout(() => {
            try {
              resolve(
                buildSeasonCards(season.perMatch, otherPlayer(side), bands),
              );
            } catch (error) {
              reject(error);
            }
          }, 0),
        )
      : undefined;
  return (
    <ProfileViewWhen view="visualizations">
      <ProfileVisualizationsView
        playerName={playerName}
        firstName={firstName}
        chipLabels={chipLabels}
        analyzed={season.analyzed}
        side={side}
        cards={buildSeasonCards(season.perMatch, side, bands)}
        savedCards={buildSeasonViewCards(season.perMatch, savedViews, bands)}
        lightbox={buildSeasonLightbox(
          season.perMatch,
          state,
          bands,
          { you: playerName, opponent: "Opponents" },
          savedViews,
          chipLabels,
        )}
        errorSplitJudged={errorSplitJudged}
        saveView={{ savedViews, workspaceName, workspaceRole }}
        otherSideCards={otherSideCards}
      />
    </ProfileViewWhen>
  );
}
