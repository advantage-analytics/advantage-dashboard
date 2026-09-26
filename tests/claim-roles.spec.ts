import { expect, test } from "@playwright/test";

import {
  CLAIM_ROLES,
  memberRoleForClaimRole,
} from "@/lib/services/programs/claim-roles";

/**
 * A join request's claim role → the membership role its invitation carries.
 * The admin console's "Send invite" used to hard-code `player`, so a coach who
 * asked to join was invited as an athlete with nothing on screen to say so.
 */
test.describe("memberRoleForClaimRole", () => {
  test("the three coach answers invite a coach", () => {
    for (const role of ["head_coach", "associate_coach", "assistant_coach"]) {
      expect(memberRoleForClaimRole(role)).toBe("coach");
    }
  });

  test("player, other and no answer invite a player", () => {
    for (const role of ["player", "other", null, undefined, "", "bogus"]) {
      expect(memberRoleForClaimRole(role)).toBe("player");
    }
  });

  test("every claim role maps to a membership role", () => {
    for (const { value } of CLAIM_ROLES) {
      expect(["coach", "player"]).toContain(memberRoleForClaimRole(value));
    }
  });
});
