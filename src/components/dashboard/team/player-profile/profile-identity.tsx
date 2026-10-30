import { StatePill } from "@/components/ui/state-pill";
import { YouPill } from "@/components/ui/you-pill";
import { getInitials } from "@/lib/data/match-utils";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { capitalize } from "@/lib/utils";
import { recordLabel } from "@/lib/data/player-profile";
import { FormTicks } from "@/components/dashboard/shared/form-ticks";
import {
  opponentBackhandLabel,
  opponentHandLabel,
} from "@/components/dashboard/opponents/opponent-style";
import type { PlayerProfile } from "@/lib/data/player-profile-server";

/**
 * Who this page is about — the identity row.
 *
 * A 72px photo or initials circle, the name in display type with one filled
 * state pill beside it (**You** on the viewer's own page, **Coach-managed**
 * on a teammate's unclaimed one), and under them the facts as outlined pills:
 * class year, singles line, hand and backhand — then the last results as
 * `FormTicks`. Filled says a state the account is in, outlined says a fixed
 * fact about the player, so the two never read as one kind (design canvas
 * H5, 2026-10-29). A fact nobody recorded is left out, not shown as a dash.
 *
 * The record sits beside the ticks as words ("1–2 this season"). The season
 * strip's Record tile states it too once a report lands, but until then the
 * strip draws every tile as "—", and this line is the only place a player
 * with results and no report has their record on the page.
 *
 * Everything on the row is the same for the player and their coach, because
 * it states facts about the player, not about who is reading. The actions sit
 * in the slot on the right (`ProfileActions`).
 *
 * "Doubles 1" is not drawn: the schema has a singles lineup spot and no
 * doubles line, and inventing one would be a rank nobody set.
 */
export function ProfileIdentity({
  profile,
  isSelf,
  photoUrl,
  actions,
}: {
  profile: PlayerProfile;
  isSelf: boolean;
  /** This player's photo, or null to draw initials. */
  photoUrl: string | null;
  actions: React.ReactNode;
}) {
  const decided = profile.wins + profile.losses;
  const hand = opponentHandLabel(profile.hand);
  const backhand = opponentBackhandLabel(profile.backhand);
  const facts = [
    profile.classYear,
    profile.lineupSpot !== null ? `Singles ${profile.lineupSpot}` : null,
    profile.role !== "player" ? capitalize(profile.role) : null,
    hand,
    backhand ? `${backhand} backhand` : null,
  ].filter((fact): fact is string => Boolean(fact));

  return (
    <div className="flex flex-col items-start gap-4 lg:flex-row lg:items-center lg:gap-5">
      <PersonAvatar
        initials={getInitials(profile.name)}
        photoUrl={photoUrl}
        className="size-[72px] bg-[var(--surface-muted)] text-[22px] font-light"
      />

      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <h1 className="truncate text-[30px] leading-[1.1] font-light tracking-[-0.3px] text-[var(--ink-900)]">
            {profile.name}
          </h1>
          {isSelf && <YouPill />}
          {profile.managedBy === "coach" && !isSelf && (
            <StatePill>Coach-managed</StatePill>
          )}
        </div>
        {(facts.length > 0 || profile.form.length > 0 || decided > 0) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {facts.length > 0 && (
              <ul aria-label="Player facts" className="contents">
                {facts.map((fact) => (
                  <li key={fact}>
                    <StatePill
                      outline
                      className="h-6 px-2.5 text-[12px] font-normal text-[var(--ink-700)]"
                    >
                      {fact}
                    </StatePill>
                  </li>
                ))}
              </ul>
            )}
            {profile.form.length > 0 && (
              <span className="ml-1.5 flex items-center">
                <FormTicks form={profile.form} />
              </span>
            )}
            {decided > 0 && (
              <span className="ml-1.5 text-[12px] text-[var(--ink-600)]">
                <span className="tabular text-[var(--ink-900)]">
                  {recordLabel(profile.wins, profile.losses)}
                </span>{" "}
                this season
              </span>
            )}
          </div>
        )}
      </div>

      {actions}
    </div>
  );
}
