# Matches and roster actions — design audit

## Decisions before implementation

Keep a ghost navigation action in the drawer footer for every reader. It is
useful redundancy with the linked name: the name identifies the record, while
the footer makes the next step explicit after reading. Keep the header for
stepping, actions and dismissal. Pin the footer outside the scrolling body.
Stack full-width buttons with a 12px gap in the 340px drawer.

| Surface / viewer                      | Ghost action    | Primary action                                    | Management                |
| ------------------------------------- | --------------- | ------------------------------------------------- | ------------------------- |
| Roster, any team member               | Open profile    | Upload for player only when upload policy permits | Staff keep existing menu  |
| Matches, uploader in either workspace | Row opens match | None                                              | Edit and confirmed Delete |
| Matches, other team viewer            | Row opens match | None                                              | No uploader-only actions  |

Event creation permission must not control read navigation or video uploads.
Upload policy is independent of roster-management permission. A player allowed
to upload should see Upload; staff excluded by the policy should not.

Team Matches gains a Roster column and matching Roster filter. Personal Matches
keeps its existing columns: the workspace already identifies the player.
Multiple roster selections form a union; different filter groups intersect.
On narrow screens the roster name appears in the match card.

## Audit limits

Matches rows continue to navigate directly. The user confirmed that Schedule
drawer changes are being implemented in another worktree and are out of scope.
The API currently authorizes the uploader only. Live Supabase policy inspection
failed with Insufficient scope, so this change must not invent broader staff
write permissions or change storage deletion order. Existing real data is not
used for destructive verification.
