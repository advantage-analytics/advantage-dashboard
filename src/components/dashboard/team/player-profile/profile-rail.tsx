import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  MatchReportRail,
  MatchReportRailFooter,
  MatchReportSpacer,
} from "@/components/dashboard/matches/match-detail/match-report";
import { ProfileViewSwitcher } from "@/components/dashboard/team/player-profile/profile-frame";
import { PlayerIdentity } from "@/components/dashboard/team/player-identity";
import { opponentPlaysLabel } from "@/components/dashboard/opponents/opponent-style";
import { YouPill } from "@/components/ui/you-pill";
import type { PlayerProfile } from "@/lib/data/player-profile-server";
import { ROSTER_PLAYER_PARAM } from "@/lib/data/roster-player-cut";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";

/**
 * The player profile's rail (design Q): the match report's 300px rail with
 * the scoreboard's slot taken by who the page is about, the report's switcher
 * cut to two views, two rows out to the lists, and New match where the
 * report has Share.
 *
 * Server-rendered; only the switcher is a client component, since it alone
 * moves `?tab=`. Every fact is the player's, so the rail reads the same to the
 * player and their coach — the `You` pill is the one thing that depends on
 * who is reading.
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

      {/* Rows in the switcher's 40px geometry, under a hairline inset like
          the scoreboard's: the tabs above stay on the page, these leave it,
          and the chevron is what says so. Each lands on the rows its number
          counts (Matches hides an unscored match). Matches takes
          `?rosterPlayer=` (`roster-player-cut.ts`): this player in EITHER
          seat, by roster id — the list's `?player=` facet reads seat one by
          name and would miss a match a teammate recorded first. Both take
          `profile.playerId`, never the URL's id — a claimed player's old
          links carry their login. A count of 0 is plain text: a link to an
          empty list is a door to nothing. */}
      <div className="mx-6 mt-2.5 h-px bg-[var(--border-hairline)]" />
      <nav
        aria-label="More about this player"
        className="flex flex-col gap-0.5 px-3 pt-2.5"
      >
        <RailRow
          label="Matches"
          count={matchesCount}
          href={`/dashboard/matches?${ROSTER_PLAYER_PARAM}=${encodeURIComponent(profile.playerId)}`}
        />
        <RailRow
          label="Opponents"
          count={opponentsCount}
          href={`/dashboard/opponents?facedBy=${profile.playerId}`}
        />
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

/** `viewRowClass`'s inactive row, as a way out of the page. */
const RAIL_ROW =
  "flex h-10 items-center gap-2 rounded-[var(--radius-element)] px-3 text-[13px]";

function RailRow({
  label,
  href,
  count,
}: {
  label: string;
  href: string;
  /** What the row counts; 0 draws it as plain text, not a link. */
  count: number;
}) {
  if (count === 0) {
    return (
      <span className={cn(RAIL_ROW, "text-[var(--ink-500)]")}>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="tabular text-[12px]">0</span>
      </span>
    );
  }
  return (
    <Link
      href={href}
      className={cn(
        RAIL_ROW,
        "text-[var(--nav-fg)] transition-colors duration-200 ease-[var(--ease-primary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="tabular text-[12px] text-[var(--ink-500)]">{count}</span>
      <ChevronRight
        className="size-3 text-[var(--ink-300)]"
        strokeWidth={1.5}
        aria-hidden="true"
      />
    </Link>
  );
}

/**
 * Who the page is about, in the scoreboard's slot and geometry (no card, a
 * hairline that stops 12px short of each rail edge). The block itself is
 * `PlayerIdentity`, shared with the roster's player drawer so a player looks
 * the same in both: the name (wrapping, never truncated) with the
 * Coach-managed glyph on a teammate's unclaimed profile, the facts line with
 * `You` on the viewer's own page, then Record and Plays.
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
  return (
    <div className="px-3">
      <div
        className="border-b border-[var(--border-hairline)]"
        style={{ padding: "18px 13px 20px" }}
      >
        <PlayerIdentity
          name={profile.name}
          nameAs="p"
          photoUrl={photoUrl}
          facts={[
            profile.classYear,
            profile.lineupSpot !== null
              ? `Singles ${profile.lineupSpot}`
              : null,
          ]}
          pill={isSelf ? <YouPill /> : null}
          coachManaged={profile.managedBy === "coach" && !isSelf}
          wins={profile.wins}
          losses={profile.losses}
          form={profile.form}
          plays={opponentPlaysLabel(profile.hand, profile.backhand)}
        />
      </div>
    </div>
  );
}
