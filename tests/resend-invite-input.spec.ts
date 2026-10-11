import { expect, test } from "@playwright/test";

import { resendInput } from "@/components/dashboard/team/roster-vocabulary";

/**
 * What Resend hands `create_program_invite`.
 *
 * An invitation sent from a roster row is bound to that row by
 * `program_invites.player_id`. Resend used to send the address and the role
 * and nothing else, so the RPC took the address for a stranger's, found it on
 * an unclaimed roster row — the one the invitation was for — and refused:
 * "Emon van Loben Sels is already on this roster without an account". The
 * Roster table and Admin › People both did it; only the row's own Invite
 * button, which passes the player, still sent.
 *
 * Pure and offline. Every surface that resends builds its arguments through
 * `resendInput`, so this is the one place the rule can be dropped.
 */

test.describe("resendInput · the arguments a resend sends", () => {
  test("an invitation bound to a roster row resends bound to it", () => {
    expect(
      resendInput({
        email: "player@example.com",
        role: "player",
        playerId: "b6f6ce87-fa6c-4292-8702-6193ab6b8887",
      }),
    ).toEqual({
      email: "player@example.com",
      role: "player",
      playerId: "b6f6ce87-fa6c-4292-8702-6193ab6b8887",
    });
  });

  test("an invitation to someone new stays unbound", () => {
    expect(
      resendInput({ email: "new@example.com", role: "staff", playerId: null }),
    ).toEqual({ email: "new@example.com", role: "staff", playerId: null });
  });

  test("an owner row still resends as a player", () => {
    expect(
      resendInput({ email: "o@example.com", role: "owner", playerId: null })
        .role,
    ).toBe("player");
  });
});
