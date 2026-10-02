import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { PersonAvatar } from "@/components/ui/person-avatar";

/**
 * The 26px mark that leads a roster player's name in a table row — the
 * viewer's own photo on their own row, a teammate's photo where the page has
 * one, initials otherwise.
 *
 * `users` RLS is own-row only, so a teammate's photo arrives as `photoUrl`
 * from `program_member_avatars` (via `getMemberAvatarUrls`) rather than off
 * the row. Pass `viewer` only on the viewer's row. Shared by the Roster and
 * the team Matches table so the two name columns cannot drift apart.
 */
export function PlayerMark({
  name,
  viewer,
  photoUrl,
}: {
  name: string;
  viewer: { initials: string; avatarUrl: string | null } | null;
  /** A teammate's photo; ignored on the viewer's own row. */
  photoUrl?: string | null;
}) {
  return viewer ? (
    <PersonAvatar
      initials={viewer.initials}
      photoUrl={viewer.avatarUrl}
      className="size-[26px] text-[9px]"
    />
  ) : (
    <InitialsAvatar name={name} photoUrl={photoUrl} />
  );
}
