import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  MatchReportRail,
  MatchReportRailFooter,
  MatchReportSpacer,
} from "@/components/dashboard/matches/match-detail/match-report";
import { ProfileViewSwitcher } from "@/components/dashboard/team/player-profile/profile-frame";
import { FormStrip } from "@/components/dashboard/shared/form-strip";
import { opponentPlaysLabel } from "@/components/dashboard/opponents/opponent-style";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { StatePill } from "@/components/ui/state-pill";
import { YouPill } from "@/components/ui/you-pill";
import { getInitials } from "@/lib/data/match-utils";
import { recordLabel } from "@/lib/data/player-profile";
import type { PlayerProfile } from "@/lib/data/player-profile-server";
import { ROSTER_PLAYER_PARAM } from "@/lib/data/roster-player-cut";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";

/** "1 match", "12 matches". */
function countLabel(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The player profile's rail (design Q): the match report's 300px rail with
 * the scoreboard's slot taken by who the page is about, the report's switcher
 * cut to two views, two quiet links out, and New match where the report has
 * Share.
 *
 * Server-rendered; only the switcher is a client component, since it alone
 * moves `?tab=`. Every fact is the player's, so the rail reads the same to the
 * player and their coach — the pill on the last line is the one thing that
 * depends on who is reading.
 */
export function ProfileRail({
  profile,
  isSelf,
  photoUrl,
  matchesCount,
  opponentsCount,
  newMatchHref,
}: {
  profile: PlayerProfile;
  isSelf: boolean;
  /** This player's photo, or null to draw initials. */
  photoUrl: string | null;
  /**
   * Every match of theirs the program recorded — the same number as the
   * title's facts line (`PlayerSeason.matchesPlayed`), so the page shows one
   * count. The Matches list it links to hides a match with no score
   * (`transformDbMatch`), so its rows can read a little fewer.
   */
  matchesCount: number;
  /** Distinct opponents across those matches. */
  opponentsCount: number;
  /** The wizard for this athlete, or null when the viewer cannot upload. */
  newMatchHref: string | null;
}) {
  return (
    <MatchReportRail label="Player summary">
      <ProfilePlayerBlock
        profile={profile}
        isSelf={isSelf}
        photoUrl={photoUrl}
      />
      <ProfileViewSwitcher />

      {/* Quiet blue words on one line, not rows: they leave the page, the
          tabs above do not. Their left edge is the tab icons' (24px). Each lands on the rows its number counts (Matches hides an unscored match). Matches takes
          `?rosterPlayer=` (`roster-player-cut.ts`): this player in EITHER
          seat, by roster id — the list's `?player=` facet reads seat one by
          name and would miss a match a teammate recorded first. Both take
          `profile.playerId`, never the URL's id — a claimed player's old
          links carry their login. A count of 0 is plain text: a link to an
          empty list is a door to nothing. */}
      <nav
        aria-label="More about this player"
        className="flex flex-wrap items-center gap-x-5 gap-y-2 px-6 pt-5"
      >
        <RailLink
          count={matchesCount}
          href={`/dashboard/matches?${ROSTER_PLAYER_PARAM}=${encodeURIComponent(profile.playerId)}`}
        >
          {countLabel(matchesCount, "match", "matches")}
        </RailLink>
        <RailLink
          count={opponentsCount}
          href={`/dashboard/opponents?facedBy=${profile.playerId}`}
        >
          {countLabel(opponentsCount, "opponent", "opponents")}
        </RailLink>
      </nav>

      <MatchReportSpacer />
      {newMatchHref && (
        <MatchReportRailFooter>
          <Link
            href={newMatchHref}
            className={cn(advButton("primary", "md"), "w-full")}
          >
            New match
          </Link>
        </MatchReportRailFooter>
      )}
    </MatchReportRail>
  );
}

function RailLink({
  href,
  count,
  children,
}: {
  href: string;
  /** What the words count; 0 draws them as plain text, not a link. */
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) {
    return (
      <span className="tabular text-[13px] text-[var(--ink-500)]">
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="tabular inline-flex items-center gap-1 text-[13px] text-[var(--blue)] transition-colors duration-200 hover:text-[var(--blue-hover)]"
    >
      {children}
      <ChevronRight className="size-3" strokeWidth={1.5} aria-hidden="true" />
    </Link>
  );
}

/**
 * Who the page is about, in the scoreboard's slot and geometry (no card, a
 * hairline that stops 12px short of each rail edge). Two groups:
 *
 *   - the header — avatar beside the name, with class year, singles line and
 *     the one state pill (`You` on the viewer's own page, `Coach-managed` on a
 *     teammate's unclaimed one) under it;
 *   - a labelled list at the rail's full width — Record (the record and last
 *     results) and Plays (the Opponents table's "Right · Two-handed" wording,
 *     `opponentPlaysLabel`). Its value column starts where the name does, so
 *     the labels sit under the avatar and the values share the name's edge.
 *
 * Every line is drawn only when it has something. Facts are plain words,
 * never outline pills: a pill is a state the account is in, and these are
 * facts about the player.
 */
export function ProfilePlayerBlock({
  profile,
  isSelf,
  photoUrl,
}: {
  profile: PlayerProfile;
  isSelf: boolean;
  photoUrl: string | null;
}) {
  const facts = [
    profile.classYear,
    profile.lineupSpot !== null ? `Singles ${profile.lineupSpot}` : null,
  ].filter((fact): fact is string => Boolean(fact));

  const plays = opponentPlaysLabel(profile.hand, profile.backhand);

  const decided = profile.wins + profile.losses;
  const hasRecord = decided > 0 || profile.form.length > 0;
  const coachManaged = profile.managedBy === "coach" && !isSelf;
  const pill = isSelf ? (
    <YouPill />
  ) : coachManaged ? (
    <StatePill>Coach-managed</StatePill>
  ) : null;

  return (
    <div className="px-3">
      <div
        className="flex flex-col gap-4 border-b border-[var(--border-hairline)]"
        style={{ padding: "18px 13px 20px" }}
      >
        <div className="flex items-center gap-3">
          <PersonAvatar
            initials={getInitials(profile.name)}
            photoUrl={photoUrl}
            className="size-10 shrink-0 bg-[var(--surface-muted)] text-[13px] font-light"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="truncate text-[14px] leading-5 font-medium text-[var(--ink-900)]">
              {profile.name}
            </p>
            {(facts.length > 0 || pill) && (
              // Wraps rather than truncates: `Coach-managed` beside a long
              // facts line takes the next line instead of cutting it off.
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                {facts.length > 0 && (
                  <span className="tabular min-w-0 truncate text-[12px] leading-[18px] text-[var(--ink-600)]">
                    {facts.join(" · ")}
                  </span>
                )}
                {pill}
              </div>
            )}
          </div>
        </div>

        {(hasRecord || plays) && (
          // 52px = the avatar's 40 + the header's 12px gap, so each value
          // starts on the name's left edge.
          <dl className="grid grid-cols-[52px_minmax(0,1fr)] items-center gap-y-1.5 text-[12px] leading-[18px]">
            {hasRecord && (
              <>
                <dt className="text-[var(--ink-600)]">Record</dt>
                <dd className="flex h-7 items-center gap-2">
                  {decided > 0 && (
                    <span className="tabular text-[var(--ink-900)]">
                      {recordLabel(profile.wins, profile.losses)}
                    </span>
                  )}
                  {profile.form.length > 0 && <FormStrip bars={profile.form} />}
                </dd>
              </>
            )}
            {plays && (
              <>
                <dt className="text-[var(--ink-600)]">Plays</dt>
                <dd className="text-[var(--ink-900)]">{plays}</dd>
              </>
            )}
          </dl>
        )}
      </div>
    </div>
  );
}
