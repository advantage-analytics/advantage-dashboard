import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
  toViewerSide,
  transformDbMatch,
  type DbMatch,
} from "@/lib/data/matches-list-types";

/**
 * The personal Matches list reads player1 as "you". A row that seats the viewer
 * as player two has to be turned first, or it names them as their own opponent
 * with the result and every set backwards, and nothing on screen looks broken.
 */

const VIEWER = "viewer-uid";
const PROFILE = "viewer-roster-profile";

type Row = DbMatch & { player2_id: string | null; created_by: string | null };

/** The shape of the live seat-two rows: seat one empty, the viewer in seat two. */
function row(overrides: Partial<Row> = {}): Row {
  return {
    id: "m1",
    player1_id: null,
    player2_id: VIEWER,
    created_by: VIEWER,
    player1_name: "Ilya Brandt",
    player2_name: "Giacomo Revelli",
    tournament_name: "Harbor Point Summer Open",
    round: null,
    date: "2026-08-22T00:00:00+00:00",
    score: {
      player1: [3, 6, 4],
      player2: [6, 3, 6],
      player1_tiebreaks: [0, 0, 0],
      player2_tiebreaks: [0, 0, 0],
    },
    result: null,
    match_type: "Singles",
    court_type: null,
    verified: null,
    duration: null,
    ...overrides,
  };
}

function display(r: Row) {
  const match = transformDbMatch(r, VIEWER);
  if (!match) throw new Error("the row should transform");
  return match;
}

function turn(r: Row, ids: readonly string[] = [VIEWER]) {
  return toViewerSide(display(r), r, ids, VIEWER);
}

test.describe("toViewerSide", () => {
  test("a viewer in seat two reads the real opponent, the win and their score", () => {
    const match = turn(row());
    expect(match.player1.name).toBe("Giacomo Revelli");
    expect(match.player2.name).toBe("Ilya Brandt");
    expect(match.score.winner).toBe("player1");
    expect(match.score.sets.map((s) => [s.player1, s.player2])).toEqual([
      [6, 3],
      [3, 6],
      [6, 4],
    ]);
    expect(match.turned).toBe(true);
  });

  test("a claimed roster profile in seat two counts as the viewer", () => {
    const r = row({ player2_id: PROFILE });
    expect(turn(r, [VIEWER, PROFILE]).player2.name).toBe("Ilya Brandt");
  });

  test("tiebreak points turn with their set", () => {
    const match = turn(
      row({
        score: {
          player1: [6],
          player2: [7],
          player1_tiebreaks: [4],
          player2_tiebreaks: [7],
        },
      }),
    );
    expect(match.score.sets[0]).toEqual({
      player1: 7,
      player2: 6,
      player1Tiebreak: 7,
      player2Tiebreak: 4,
    });
  });

  test("the viewer's own style never reads as the opponent's", () => {
    const r = row();
    const match = display(r);
    match.player2Hand = "right";
    match.player2Backhand = "two-handed";
    const turned = toViewerSide(match, r, [VIEWER], VIEWER);
    expect(turned.player2Hand).toBeUndefined();
    expect(turned.player2Backhand).toBeUndefined();
  });

  test("the rows the page attached survive the turn", () => {
    const r = row();
    const match = { ...display(r), canManage: true };
    expect(toViewerSide(match, r, [VIEWER], VIEWER).canManage).toBe(true);
  });

  test("a level score keeps the list's default rather than flipping it", () => {
    const match = turn(row({ score: { player1: [6], player2: [6] } }));
    expect(match.score.winner).toBe("player2");
  });

  test("a viewer in seat one comes back untouched", () => {
    const r = row({
      player1_id: VIEWER,
      player2_id: null,
      player1_name: "Giacomo Revelli",
      player2_name: "Ilya Brandt",
    });
    const match = display(r);
    const turned = toViewerSide(match, r, [VIEWER], VIEWER);
    expect(turned).toBe(match);
    expect(turned.turned).toBeUndefined();
  });

  test("a legacy upload with no ids reads as the uploader's, in seat one", () => {
    const r = row({ player2_id: null });
    const match = display(r);
    expect(toViewerSide(match, r, [VIEWER], VIEWER)).toBe(match);
  });

  test("a seat two that is somebody else is never read as the viewer's", () => {
    const r = row({ player1_id: "someone", player2_id: "someone-else" });
    const match = display(r);
    expect(toViewerSide(match, r, [VIEWER], VIEWER)).toBe(match);
  });
});

test.describe("wiring", () => {
  test("only the personal scope of the list turns its rows", () => {
    const page = readFileSync(
      "src/app/dashboard/matches/(list)/page.tsx",
      "utf8",
    );
    expect(page).toMatch(
      /isTeam\s*\?\s*withRosterProfiles\([\s\S]*?\)\s*:\s*withViewerSide\(rows, user\.id, enrichMatches\(/,
    );
  });

  test("the drawer's figures come from the side the row reads from", () => {
    const drawer = readFileSync(
      "src/components/dashboard/matches/match-drawer.tsx",
      "utf8",
    );
    const sections = readFileSync(
      "src/components/dashboard/matches/drawer-sections.tsx",
      "utf8",
    );
    expect(drawer).toContain(
      "useMatchSnapshot(match.id, inFlight, match.turned)",
    );
    expect(sections).toContain('.eq("is_player1", !turned)');
  });
});
