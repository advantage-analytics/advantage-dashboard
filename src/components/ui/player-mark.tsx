import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { PersonAvatar } from "@/components/ui/person-avatar";

/**
 * The 26px mark that leads a roster player's name in a table row — the
 * viewer's own photo on their own row, initials on everyone else's.
 *
 * Only the viewer's photo is drawn because it is the only one readable:
 * `users` RLS is own-row only, so a teammate's `avatar_path` never reaches the
 * client. Pass `viewer` only on the viewer's row. Shared by the Roster and the
 * team Matches table so the two name columns cannot drift apart.
 */
export function PlayerMark({
  name,
  viewer,
}: {
  name: string;
  viewer: { initials: string; avatarUrl: string | null } | null;
}) {
  return viewer ? (
    <PersonAvatar
      initials={viewer.initials}
      photoUrl={viewer.avatarUrl}
      className="size-[26px] text-[9px]"
    />
  ) : (
    <InitialsAvatar name={name} />
  );
}
