/**
 * A program role, and how it is named to the person about to hold it.
 *
 * A leaf on purpose: no imports, so the dashboard's header can print "a
 * player" without pulling the join flow's terms, links and buttons into the
 * chunk every dashboard page loads. `JoinRole` mirrors
 * `program_invites_role_check`; owner moves by transfer, never by invitation.
 */
export type JoinRole = "coach" | "staff" | "player";

export const ROLE_NOUN: Record<JoinRole, string> = {
  coach: "a coach",
  staff: "staff",
  player: "a player",
};

/**
 * The one sentence an invitation is introduced with.
 *
 * `inviterName` is however much of a person the flow is allowed to name, and
 * it is printed whole or not at all — never split for effect. Two pages used
 * to spell this out separately, and a copy edit to one of them is how
 * "invited you to join" and "you've been invited to" end up on two screens of
 * the same flow.
 */
export function inviteSentence(invite: {
  programName: string;
  role: JoinRole;
  inviterName: string | null;
}): string {
  const noun = ROLE_NOUN[invite.role];
  return invite.inviterName
    ? `${invite.inviterName} invited you to join ${invite.programName} as ${noun}.`
    : `You've been invited to join ${invite.programName} as ${noun}.`;
}
