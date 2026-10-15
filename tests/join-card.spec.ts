import { expect, test } from "@playwright/test";

import { joinCard } from "@/lib/services/programs/join-card";
import type { JoinState } from "@/lib/services/programs/invite-acceptance";

/**
 * The card a join link unfurls into (`/join/[token]/opengraph-image`): a
 * team's own link names the team, and nothing else does — an invitation was
 * for one person, and a dead token must look like one that never existed.
 */

const programName = "Meridian State Women's Tennis";
const state = (kind: JoinState["kind"]) =>
  ({ kind, programName }) as unknown as JoinState;

test("an open join link names the team and offers the join", () => {
  for (const kind of ["link_sign_up", "link_ready"] as const) {
    const card = joinCard(state(kind));
    expect(card?.headline).toBe(programName);
    expect(card?.line).toBe("Join as a player");
    expect(card?.lineTone).toBeUndefined();
  }
});

test("a full team's card says so and does not offer the join", () => {
  const card = joinCard(state("link_full"));
  expect(card?.headline).toBe(programName);
  expect(card?.line).toBe("Every player seat is taken");
  expect(card?.lineTone).toBe("quiet");
});

test("invitations and dead tokens draw no team name", () => {
  for (const kind of [
    "not_found",
    "expired",
    "already_used",
    "wrong_account",
    "ready",
    "sign_in",
    "sign_up",
  ] as const) {
    expect(joinCard(state(kind)), kind).toBeNull();
  }
});
