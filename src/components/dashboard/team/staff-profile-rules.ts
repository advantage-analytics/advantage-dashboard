/**
 * The rules for a player profile held by the owner, a coach or staff — pure,
 * with no UI and no Supabase import, so `tests/staff-profile-rules.spec.ts`
 * can pin them role by role.
 *
 * Presentation only, every one of them: the database decides
 * (`add_self_as_program_player`, `archive_program_player`,
 * `merge_program_players`). These exist so the screen never offers a control
 * the function refuses, or hides one it allows.
 */

import type { ProgramRole } from "@/lib/workspace/types";

/**
 * What Add player and Invite need to recognise the viewer typing their own
 * address: the address, and the way out. Null when the viewer is a player or
 * already holds a profile — then the address is simply a duplicate, and the
 * database's own sentence is the right one.
 */
export type OwnAddressOffer = { email: string; onAddSelf: () => void } | null;

/**
 * Who is offered "Add yourself as a player": the owner, a coach or staff, with
 * no live profile of their own on this roster. One rule, read by the wizard's
 * For menu and by the roster's dialogs, so the two cannot disagree. Presentation
 * only — `add_self_as_program_player` re-checks.
 */
export function mayAddSelf(role: ProgramRole, holdsProfile: boolean): boolean {
  return role !== "player" && !holdsProfile;
}

/** Whether `typed` is the viewer's own address, under an offer that applies. */
export function isOwnAddress(offer: OwnAddressOffer, typed: string): boolean {
  const address = typed.trim().toLowerCase();
  return (
    offer !== null &&
    address !== "" &&
    address === offer.email.trim().toLowerCase()
  );
}

/**
 * Who may take a staff-held player profile off the roster — the mirror of
 * `archive_program_player`'s ladder: the person themselves, the owner, or a
 * coach acting on a staff member's. One rule for the drawer's menu and the
 * Edit player dialog. Presentation only — the function refuses the rest.
 */
export function mayRemoveStaffProfile(
  viewerRole: ProgramRole,
  holderRole: Exclude<ProgramRole, "player">,
  isViewer: boolean,
): boolean {
  return (
    isViewer ||
    viewerRole === "owner" ||
    (viewerRole === "coach" && holderRole === "staff")
  );
}
