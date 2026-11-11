import Link from "next/link";
import { CoachManagedMark } from "@/components/ui/coach-managed-mark";
import { FormStrip } from "@/components/dashboard/shared/form-strip";
import type { FormBar } from "@/lib/data/form-bar";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { getInitials } from "@/lib/data/match-utils";
import { recordLabel } from "@/lib/data/player-profile";

/**
 * Who a player is, drawn the same way wherever one player is the subject: the
 * roster's player drawer and the player profile's rail (drawer redesign,
 * "Previous iteration" boards). One component so the two cannot drift — a
 * coach opening a player from the roster and then their page sees one block.
 *
 *   - the header: a 40px avatar beside the name, with the facts line
 *     ("Junior · Singles 2") under it;
 *   - a labelled list at full width — Record (the record and the form strip)
 *     and Plays — whose values start on the name's left edge (52px = the
 *     avatar's 40 + the 12px gap).
 *
 * The name WRAPS, never truncates: a person's name on their own record is the
 * one thing this block exists to show, and a tooltip is no fix for a clipped
 * one. `items-start` keeps the avatar level with the first line of a name
 * that runs to two, and `overflow-wrap:anywhere` breaks a single unbroken
 * word rather than letting it run out of a 250px rail.
 *
 * Coach-managed is `CoachManagedMark` (`ui/coach-managed-mark.tsx`) straight
 * after the name, and the viewer's own `You` pill follows it — both beside
 * the name, so the facts line holds facts only.
 */
export function PlayerIdentity({
  name,
  href,
  photoUrl = null,
  facts,
  pill = null,
  coachManaged = false,
  wins = 0,
  losses = 0,
  form = [],
  plays = null,
  nameAs = "h2",
  markAlign = "start",
}: {
  name: string;
  /** Where the name leads (the profile), or omitted on the profile itself. */
  href?: string;
  photoUrl?: string | null;
  /** Plain facts for the line under the name, in order; empties are dropped. */
  facts: readonly (string | null | undefined)[];
  /** The one pill that depends on who is reading — today only `YouPill`, drawn beside the name. */
  pill?: React.ReactNode;
  coachManaged?: boolean;
  wins?: number;
  losses?: number;
  form?: readonly FormBar[];
  /** The Opponents table's wording ("Right · Two-handed"), or null. */
  plays?: string | null;
  /**
   * The name's element. The drawer's dialog is titled by it (`h2`); the
   * profile rail passes `p`, because the page's own heading already names the
   * player and the rail is a summary beside it.
   */
  nameAs?: "h2" | "p";
  /**
   * Which edge of the Coach-managed tooltip lines up with the glyph. The
   * tooltip opens toward the room the host has: the roster drawer sits on
   * the screen's right edge, so it passes `end` and the tooltip opens back
   * over the name; the profile rail sits on the left and keeps `start`.
   */
  markAlign?: "start" | "end";
}) {
  const factLine = facts.filter((fact): fact is string => Boolean(fact));
  const decided = wins + losses;
  const hasRecord = decided > 0 || form.length > 0;
  const Heading = nameAs;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <PersonAvatar
          initials={getInitials(name)}
          photoUrl={photoUrl}
          className="size-10 shrink-0 text-[13px] font-light"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-[3px] pt-px">
          <Heading className="text-[16px] leading-[22px] font-normal [text-wrap:balance] [overflow-wrap:anywhere] text-[var(--ink-900)]">
            {href ? (
              <Link
                href={href}
                className="rounded-[var(--radius-cell)] text-[var(--ink-900)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
              >
                {name}
              </Link>
            ) : (
              name
            )}
            {coachManaged && (
              <CoachManagedMark align={markAlign} className="ml-1.5" />
            )}
            {/* `You` is identity, not standing, so it sits beside the name
                (Settings Pages rule, `reference/settings.md`), never on the
                facts line. */}
            {pill && (
              <span className="ml-2 inline-flex align-[2px]">{pill}</span>
            )}
          </Heading>
          {factLine.length > 0 && (
            <span className="tabular min-w-0 text-[12px] leading-[18px] text-[var(--ink-600)]">
              {factLine.join(" · ")}
            </span>
          )}
        </div>
      </div>

      {(hasRecord || plays) && (
        <dl className="grid grid-cols-[52px_minmax(0,1fr)] items-center gap-y-1.5 text-[12px] leading-[18px]">
          {hasRecord && (
            <>
              <dt className="text-[var(--ink-600)]">Record</dt>
              <dd className="flex h-7 items-center gap-2">
                {decided > 0 && (
                  <span className="tabular text-[var(--ink-900)]">
                    {recordLabel(wins, losses)}
                  </span>
                )}
                {form.length > 0 && <FormStrip bars={form} />}
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
  );
}
