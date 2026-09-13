import { YouPill } from "@/components/ui/new-pill";
import { getInitials } from "@/lib/data/match-utils";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { recordLabel } from "@/lib/data/player-profile";
import { capitalize } from "@/lib/utils";
import type { PlayerProfile } from "@/lib/data/player-profile-server";

/**
 * Who this page is about — Platform Audit `Te` / `Te2`'s identity row.
 *
 * A 76px initials circle, the name in display type, and one line of facts
 * under it: class year, line, record. The **You** pill is the only marker of
 * whose page it is, and it is the one thing here that differs between the
 * two frames — everything else on the row is the same for the player and
 * their coach, because the row states facts about the player, not about who
 * is reading. The actions sit in the slot on the right (`ProfileActions`).
 *
 * "Doubles 1" from the frame is not drawn: the schema has a singles lineup
 * spot and no doubles line, and inventing one would be a rank nobody set.
 */
export function ProfileIdentity({
  profile,
  isSelf,
  photoUrl,
  actions,
}: {
  profile: PlayerProfile;
  isSelf: boolean;
  /** The viewer's own photo, on their own page only; other players have none yet. */
  photoUrl: string | null;
  actions: React.ReactNode;
}) {
  const facts: React.ReactNode[] = [];
  if (profile.classYear) facts.push(profile.classYear);
  if (profile.lineupSpot !== null) facts.push(`Singles ${profile.lineupSpot}`);
  if (profile.role !== "player") facts.push(capitalize(profile.role));
  facts.push(
    <>
      <span className="tabular">
        {recordLabel(profile.wins, profile.losses)}
      </span>{" "}
      this season
    </>,
  );

  return (
    <div className="flex flex-col items-start gap-4 lg:flex-row lg:items-center lg:gap-5">
      <PersonAvatar
        initials={getInitials(profile.name)}
        photoUrl={photoUrl}
        className="size-[76px] bg-[var(--surface-muted)] text-[24px] font-normal"
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2.5">
          <h1 className="truncate text-[30px] leading-[1.15] font-light tracking-[-0.3px] text-[var(--ink-900)]">
            {profile.name}
          </h1>
          {isSelf && <YouPill />}
          {profile.managedBy === "coach" && !isSelf && (
            <span className="inline-flex h-[18px] items-center rounded-[var(--radius-pill)] bg-[var(--surface-subtle)] px-2 text-[10px] font-medium text-[var(--ink-700)]">
              Coach-managed
            </span>
          )}
        </div>
        <p className="text-[12px] text-[var(--ink-600)]">
          {facts.map((fact, i) => (
            <span key={i}>
              {i > 0 && " · "}
              {fact}
            </span>
          ))}
        </p>
      </div>

      {actions}
    </div>
  );
}
