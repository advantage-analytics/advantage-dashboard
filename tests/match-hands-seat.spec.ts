import { expect, test } from "@playwright/test";
import { playerHands } from "../src/components/dashboard/matches/player-hands";
import { enteredHandsFor } from "../src/lib/data/labels-server";
import { transformDbMatchToMatch } from "../src/lib/data/match-detail-server";

/**
 * A match row's hands belong to seats, not to whoever is reading. The wizard
 * writes `player_hand` / `player_backhand` for seat one and `opponent_hand` /
 * `opponent_backhand` for seat two, so the report gives the same hands to
 * every viewer, whichever seat it is turned to (guardrails §4). The Approaches
 * wings, Direction's inside-out and the point list's wording all read these
 * through `playerHands`; a swap on the viewer mirrors them.
 */

type Row = Parameters<typeof transformDbMatchToMatch>[0];
type Profiles = Parameters<typeof transformDbMatchToMatch>[2];

function row(overrides: Record<string, unknown> = {}): Row {
  return {
    id: "m1",
    player1_name: "Ana Castillo",
    player2_name: "Mia Okafor",
    date: "2026-10-20T00:00:00Z",
    score: { player1: [6, 6], player2: [3, 4] },
    program_id: "prog",
    player1_id: "ana",
    player2_id: "mia",
    player_hand: "left",
    player_backhand: "one-handed",
    opponent_hand: "right",
    opponent_backhand: "two-handed",
    ...overrides,
  } as unknown as Row;
}

/** Each way a report can be turned, with the seat it must end up on. */
const ORIENTATIONS: {
  name: string;
  playerIds: string[];
  rosterIds: string[];
  pinned?: "player1" | "player2";
  isUserPlayer1: boolean;
}[] = [
  {
    name: "a viewer in seat one",
    playerIds: ["ana"],
    rosterIds: [],
    isUserPlayer1: true,
  },
  {
    name: "a viewer in seat two",
    playerIds: ["mia"],
    rosterIds: [],
    isUserPlayer1: false,
  },
  {
    name: "a viewer in neither seat, seat two on the roster",
    playerIds: ["coach"],
    rosterIds: ["mia"],
    isUserPlayer1: false,
  },
  {
    name: "a report pinned to seat two",
    playerIds: [],
    rosterIds: [],
    pinned: "player2",
    isUserPlayer1: false,
  },
];

const PROFILES: Profiles = new Map([
  ["ana", { hand: "right", backhand: "two-handed" }],
  ["mia", { hand: "left", backhand: "one-handed" }],
]) as unknown as Profiles;

for (const o of ORIENTATIONS) {
  const build = (r: Row, profiles: Profiles = new Map()) =>
    transformDbMatchToMatch(r, o.playerIds, profiles, o.rosterIds, o.pinned);

  test.describe(o.name, () => {
    test("is the orientation this case claims to be", () => {
      expect(build(row()).isUserPlayer1).toBe(o.isUserPlayer1);
    });

    test("player_hand is seat one's and opponent_hand seat two's", () => {
      const match = build(row());
      expect(match.player1.hand).toBe("left");
      expect(match.player2.hand).toBe("right");
    });

    test("player_backhand is seat one's and opponent_backhand seat two's", () => {
      const match = build(row());
      expect(match.player1.backhand).toBe("one-handed");
      expect(match.player2.backhand).toBe("two-handed");
    });

    test("the row's columns win over each seat's profile", () => {
      // The profiles say the opposite of the row on every field.
      const match = build(row(), PROFILES);
      expect(match.player1.hand).toBe("left");
      expect(match.player1.backhand).toBe("one-handed");
      expect(match.player2.hand).toBe("right");
      expect(match.player2.backhand).toBe("two-handed");
    });

    test("a null player_* column falls back to seat one's own profile", () => {
      const match = build(
        row({ player_hand: null, player_backhand: null }),
        PROFILES,
      );
      expect(match.player1.hand).toBe("right");
      expect(match.player1.backhand).toBe("two-handed");
      expect(match.player2.hand).toBe("right");
      expect(match.player2.backhand).toBe("two-handed");
    });

    test("a null opponent_* column falls back to seat two's own profile", () => {
      const match = build(
        row({ opponent_hand: null, opponent_backhand: null }),
        PROFILES,
      );
      expect(match.player1.hand).toBe("left");
      expect(match.player1.backhand).toBe("one-handed");
      expect(match.player2.hand).toBe("left");
      expect(match.player2.backhand).toBe("one-handed");
    });

    test("playerHands reads left for seat one and right for seat two", () => {
      expect(playerHands(build(row()))).toEqual({
        player1: "left",
        player2: "right",
      });
    });
  });
}

/* ── The legacy seat-two row ─────────────────────────────────────────────── */

/**
 * The one exception: a row with no `player1_id` and a `player2_id` seats the
 * account holder second, and its `player_*` columns are theirs — seat two's
 * (`playerColumnsSeat`). Four live rows have that shape. Still a seat rule,
 * so still the same hands for every reader.
 */
const LEGACY = {
  player1_id: null,
  player2_id: "mia",
  player_hand: "left",
  player_backhand: "one-handed",
  opponent_hand: "right",
  opponent_backhand: "two-handed",
};

const LEGACY_ORIENTATIONS: {
  name: string;
  playerIds: string[];
  rosterIds: string[];
  pinned?: "player1" | "player2";
  isUserPlayer1: boolean;
}[] = [
  {
    name: "a viewer in seat two",
    playerIds: ["mia"],
    rosterIds: [],
    isUserPlayer1: false,
  },
  {
    name: "a viewer in neither seat",
    playerIds: ["coach"],
    rosterIds: ["mia"],
    isUserPlayer1: false,
  },
  {
    name: "a report pinned to seat one",
    playerIds: [],
    rosterIds: [],
    pinned: "player1",
    isUserPlayer1: true,
  },
];

for (const o of LEGACY_ORIENTATIONS) {
  test.describe(`a legacy seat-two row, ${o.name}`, () => {
    const build = (r: Row, profiles: Profiles = new Map()) =>
      transformDbMatchToMatch(r, o.playerIds, profiles, o.rosterIds, o.pinned);

    test("is the orientation this case claims to be", () => {
      expect(build(row(LEGACY)).isUserPlayer1).toBe(o.isUserPlayer1);
    });

    test("player_* is seat two's and opponent_* seat one's", () => {
      const match = build(row(LEGACY));
      expect(match.player2.hand).toBe("left");
      expect(match.player2.backhand).toBe("one-handed");
      expect(match.player1.hand).toBe("right");
      expect(match.player1.backhand).toBe("two-handed");
    });

    test("the row's columns still win over seat two's profile", () => {
      const match = build(row(LEGACY), PROFILES);
      expect(match.player2.hand).toBe("left");
      expect(match.player2.backhand).toBe("one-handed");
      expect(match.player1.hand).toBe("right");
    });

    test("a null player_* column falls back to seat two's own profile", () => {
      const match = build(
        row({ ...LEGACY, player_hand: null, player_backhand: null }),
        new Map([
          ["mia", { hand: "right", backhand: "two-handed" }],
        ]) as unknown as Profiles,
      );
      expect(match.player2.hand).toBe("right");
      expect(match.player2.backhand).toBe("two-handed");
      expect(match.player1.hand).toBe("right");
    });
  });
}

/* ── Every other shape reads player_* as seat one ────────────────────────── */

const SEAT_ONE_SHAPES: { name: string; ids: Record<string, string | null> }[] =
  [
    {
      name: "both seat ids set",
      ids: { player1_id: "ana", player2_id: "mia" },
    },
    {
      name: "only player1_id set",
      ids: { player1_id: "ana", player2_id: null },
    },
    {
      name: "neither seat id set",
      ids: { player1_id: null, player2_id: null },
    },
  ];

for (const shape of SEAT_ONE_SHAPES) {
  test(`a row with ${shape.name} reads player_* as seat one`, () => {
    for (const o of ORIENTATIONS) {
      const match = transformDbMatchToMatch(
        row(shape.ids),
        o.playerIds,
        new Map(),
        o.rosterIds,
        o.pinned,
      );
      expect(match.player1.hand, o.name).toBe("left");
      expect(match.player1.backhand, o.name).toBe("one-handed");
      expect(match.player2.hand, o.name).toBe("right");
      expect(match.player2.backhand, o.name).toBe("two-handed");
    }
  });
}

/* ── The report and the label console agree ──────────────────────────────── */

for (const [name, overrides] of [
  ["the legacy seat-two row", LEGACY],
  ["a wizard row with both seat ids set", {}],
] as const) {
  test(`${name}: the transform's hands are enteredHandsFor's`, () => {
    const r = row(overrides);
    const entered = enteredHandsFor(
      {
        player_hand: r.player_hand,
        opponent_hand: r.opponent_hand,
        player1_id: r.player1_id,
        player2_id: r.player2_id,
        opponent_player_id: null,
      },
      () => null,
    );
    // Differing hands, so an agreement cannot be two swaps cancelling.
    expect(entered.p1).not.toBe(entered.p2);
    for (const o of [...ORIENTATIONS, ...LEGACY_ORIENTATIONS]) {
      const match = transformDbMatchToMatch(
        r,
        o.playerIds,
        new Map(),
        o.rosterIds,
        o.pinned,
      );
      expect(match.player1.hand, o.name).toBe(entered.p1);
      expect(match.player2.hand, o.name).toBe(entered.p2);
    }
  });
}
