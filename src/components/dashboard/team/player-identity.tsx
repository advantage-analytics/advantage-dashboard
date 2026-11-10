import Link from "next/link";
import { UserRoundCog } from "lucide-react";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
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
 *     ("Junior · Singles 2") and the viewer's own `You` pill under it;
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
 * Coach-managed is a glyph, not a pill (design owner's pick over the pill,
 * 2026-11-10): `UserRoundCog` straight after the name, ink-400, with the dark
 * tooltip saying what it means. It is focusable so the tooltip opens from the
 * keyboard too, and `ChromeTooltip` opens it on press-and-hold on a touch
 * screen. `Shield` (the guardian choice in the claim flow) and `Lock`
 * (private) were ruled out because the app already uses them.
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
  /** The one pill that depends on who is reading — today only `YouPill`. */
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
            {coachManaged && <CoachManagedMark align={markAlign} />}
          </Heading>
          {(factLine.length > 0 || pill) && (
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              {factLine.length > 0 && (
                <span className="tabular min-w-0 text-[12px] leading-[18px] text-[var(--ink-600)]">
                  {factLine.join(" · ")}
                </span>
              )}
              {pill}
            </div>
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

/**
 * The Coach-managed glyph and the tooltip that names it.
 *
 * The tooltip opens BELOW the glyph: the block sits straight under the
 * drawer's 44px header (and the rail's top), so a tooltip above it would
 * cover the ‹ › and ✕ a reader is about to use. One edge lines up with the
 * glyph (`align`, chosen by the host): centred, it would hang off the name's
 * end, and at the wrong edge it ran past the drawer and off the screen. The
 * label
 * is the state, the detail what it means — "No login yet" first, because
 * that is the fact; who uploads follows from it. What to DO about it is the
 * drawer's well, for staff, and never repeated here.
 */
function CoachManagedMark({ align }: { align: "start" | "end" }) {
  return (
    <ChromeTooltip
      label="Coach-managed"
      detail="No login yet · Staff upload their matches"
      side="bottom"
      align={align}
      sideOffset={6}
    >
      <span
        role="img"
        aria-label="Coach-managed"
        tabIndex={0}
        className="ml-1.5 inline-flex cursor-default rounded-[var(--radius-cell)] align-[-1px] text-[var(--ink-400)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--ink-600)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none touch:hit-area"
      >
        <UserRoundCog className="size-3.5" strokeWidth={1.5} aria-hidden />
      </span>
    </ChromeTooltip>
  );
}
