import { expect, test } from "@playwright/test";

import {
  adminTeamJoinLink,
  adminTeamLatestMatches,
  type AdminTeamMatchFacts,
} from "@/lib/data/admin-team-links";
import { joinHref } from "@/lib/services/programs/join-links";

/**
 * Admin › Teams detail — the player join link and latest matches (T11). Pure
 * mappers, no I/O. The token below is made up; a real one never belongs in a
 * spec.
 */

const FAKE_TOKEN = "spec-token";
const toUrl = (token: string) => `https://advantage.test${joinHref(token)}`;

test("a live link maps to its url and mode", () => {
  expect(adminTeamJoinLink({ token: FAKE_TOKEN, mode: "open" }, toUrl)).toEqual(
    { url: "https://advantage.test/join/spec-token", mode: "open" },
  );
  expect(
    adminTeamJoinLink({ token: FAKE_TOKEN, mode: "approve" }, toUrl),
  ).toEqual({ url: "https://advantage.test/join/spec-token", mode: "approve" });
});

test("an unrecognised mode reads as open, as the settings loader reads it", () => {
  expect(
    adminTeamJoinLink({ token: FAKE_TOKEN, mode: null }, toUrl)?.mode,
  ).toBe("open");
});

test("no link maps to null and builds no url", () => {
  let built = 0;
  const counting = (token: string) => {
    built += 1;
    return toUrl(token);
  };
  expect(adminTeamJoinLink(null, counting)).toBeNull();
  expect(adminTeamJoinLink(undefined, counting)).toBeNull();
  expect(adminTeamJoinLink({ token: null, mode: "open" }, counting)).toBeNull();
  expect(built).toBe(0);
});

function match(
  id: string,
  uploadedAt: string | null,
  overrides: Partial<AdminTeamMatchFacts> = {},
): AdminTeamMatchFacts {
  return {
    id,
    uploadedAt,
    date: "2026-11-01T00:00:00+00:00",
    player: `Player ${id}`,
    opponent: `Opponent ${id}`,
    analysis: {
      status: "completed",
      providerId: "splitstep",
      jobId: `job-${id}`,
    },
    bucket: "settled",
    ...overrides,
  };
}

test("three matches come back newest upload first", () => {
  const rows = [
    match("a", "2026-11-02T10:00:00.000Z"),
    match("b", "2026-11-05T10:00:00.000Z", {
      analysis: { status: "failed", providerId: "splitstep", jobId: "job-b" },
      bucket: "failed",
    }),
    match("c", "2026-11-03T10:00:00.000Z"),
  ];
  const input = [...rows];

  expect(adminTeamLatestMatches(rows)).toEqual([
    {
      id: "b",
      player: "Player b",
      opponent: "Opponent b",
      uploadedAt: "2026-11-05T10:00:00.000Z",
      analysis: { status: "failed", providerId: "splitstep", jobId: "job-b" },
      bucket: "failed",
    },
    {
      id: "c",
      player: "Player c",
      opponent: "Opponent c",
      uploadedAt: "2026-11-03T10:00:00.000Z",
      analysis: {
        status: "completed",
        providerId: "splitstep",
        jobId: "job-c",
      },
      bucket: "settled",
    },
    {
      id: "a",
      player: "Player a",
      opponent: "Opponent a",
      uploadedAt: "2026-11-02T10:00:00.000Z",
      analysis: {
        status: "completed",
        providerId: "splitstep",
        jobId: "job-a",
      },
      bucket: "settled",
    },
  ]);
  // The caller's array is left in the order it was given.
  expect(rows).toEqual(input);
});

test("only the three newest are kept, and an unknown upload moment sorts last", () => {
  const rows = [
    match("old", "2026-10-01T10:00:00.000Z"),
    match("unknown", null, { date: "2026-12-01T00:00:00+00:00" }),
    match("newest", "2026-11-09T10:00:00.000Z"),
    match("mid", "2026-11-04T10:00:00.000Z"),
  ];
  expect(adminTeamLatestMatches(rows).map((row) => row.id)).toEqual([
    "newest",
    "mid",
    "old",
  ]);
  expect(adminTeamLatestMatches(rows, 4).map((row) => row.id)).toEqual([
    "newest",
    "mid",
    "old",
    "unknown",
  ]);
  expect(adminTeamLatestMatches([])).toEqual([]);
});
