import {
  SettingsCard,
  SettingsCardTitle,
} from "@/components/dashboard/settings/settings-card";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { getInitials } from "@/lib/data/match-utils";
import { formatHoursShort } from "@/lib/data/usage-format";
import { getMonthlyCapSeconds } from "@/lib/services/splitstep/config";
import { quotaTierFor } from "@/lib/services/splitstep/quota";
import type { AdminTeamMember } from "@/lib/data/admin-team-server";
import type { ProgramUsage } from "@/lib/data/usage-server";
import type { ProgramOrgType } from "@/lib/workspace/types";

/**
 * Who on this program spent this month's Advantage Intelligence time.
 *
 * The rail's second card, under Pilot: Pilot says how much of the pool is
 * gone, this says by whom. One row per person with a line in `data.usage` —
 * the program ledger, `account_type = 'program'`, already summed and sorted by
 * `readUsage()` — and nothing else, so the rows always add up to the total the
 * Pilot card's meter draws.
 *
 * **The canvas' footer is not printed as drawn.** `TeamPage.dc.html` reads
 * "Players use their own 2 h before the team pool" and draws one row as
 * `1.5 of 2 h`. Nothing in the product orders allowances that way:
 * `reserveQuota()` files every upload made inside a team workspace under the
 * program's own ledger (`accountTypeFor` → `'program'`, keyed by program id),
 * and both reservation functions sum that ledger per account, not per
 * member. A member's own 2 h is their PERSONAL workspace's allowance and never
 * touches a team upload. So no row here is ever "drawing on an individual
 * allowance", and the `of 2 h` form would state a per-person cap that does not
 * exist. See `poolRuleNote()` for what the footer says instead.
 *
 * A server component: nothing on it is interactive, and the month is the
 * current one — the old month stepper went with the Usage sub-route (T8).
 */
export function AdminUsageCard({
  usage,
  orgType,
  members,
}: {
  usage: ProgramUsage;
  /** Decides which cap the program draws — see `quotaTierFor()`. */
  orgType: ProgramOrgType | null;
  /** For avatars only; a line whose author has left keeps its initials. */
  members: readonly Pick<AdminTeamMember, "userId" | "avatarUrl">[];
}) {
  const avatarById = new Map(members.map((m) => [m.userId, m.avatarUrl]));
  const videos = usage.lines.reduce(
    (total, line) => total + line.matchCount,
    0,
  );
  const note = poolRuleNote(orgType);

  return (
    <SettingsCard className="gap-0 bg-[var(--surface-card)]">
      <SettingsCardTitle
        trailing={
          <span className="text-[11px] text-[var(--ink-500)] tabular-nums">
            {videos} {videos === 1 ? "video" : "videos"}
          </span>
        }
      >
        Usage in {monthName(usage.billingMonth)}
      </SettingsCardTitle>

      <div className="mt-3 flex flex-col">
        {usage.lines.map((line) => (
          <div
            key={line.userId}
            className="flex min-h-9 items-center justify-between gap-4 border-t border-[var(--border-hairline)] py-1.5"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <PersonAvatar
                initials={getInitials(line.name)}
                photoUrl={avatarById.get(line.userId)}
                className="size-6 text-[10px]"
              />
              <span className="truncate text-[12px] text-[var(--ink-900)]">
                {line.name}
              </span>
            </span>
            <span className="shrink-0 text-[12px] text-[var(--ink-900)] tabular-nums">
              {formatHoursShort(line.usedSeconds)} h
            </span>
          </div>
        ))}

        {/* The empty line replaces the list, never the card — the title and
            the zero count are still true, and a missing card would read as a
            page that failed to load rather than a quiet month. */}
        {usage.lines.length === 0 && (
          <p className="border-t border-[var(--border-hairline)] py-3 text-[12px] text-[var(--ink-500)]">
            No video analysed yet this month.
          </p>
        )}
      </div>

      <p className="mt-3 text-[11px] leading-[1.5] text-[var(--ink-500)]">
        {note}
      </p>
    </SettingsCard>
  );
}

/**
 * How this program's members relate to the individual figure — the canvas'
 * footer, rewritten to what `quota.ts` actually does.
 *
 * - A verified college draws the program figure, and every upload inside it
 *   files under the team pool. The individual figure is still worth naming,
 *   because Pilot's "Each member 2 h" row invites the reading that it is spent
 *   first; it covers a member's personal uploads only.
 * - Every other org type (and an unset one) is on the individual figure for
 *   the whole team — one allowance on the program ledger, shared.
 *
 * The figure is `getMonthlyCapSeconds("individual")`, never a literal 2, so it
 * moves when the tier does. Exported for the spec.
 */
export function poolRuleNote(orgType: ProgramOrgType | null): string {
  const cap = formatHoursShort(getMonthlyCapSeconds("individual"));
  if (quotaTierFor({ kind: "team", orgType }) === "program") {
    return `Uploads here draw on the team pool. A member’s own ${cap} h covers their personal uploads only.`;
  }
  return `This team is on the individual ${cap} h figure, shared by every member.`;
}

/** `2026-09-01` → `September`, in UTC — the key is a zone-free date. */
function monthName(billingMonth: string): string {
  return new Date(`${billingMonth}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
}
