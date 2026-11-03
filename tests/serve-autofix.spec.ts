import { expect, test } from "@playwright/test";

import type {
  LabelPointSeed,
  LabelShotSeed,
  LabelShotSeedValues,
} from "@/lib/services/labels/seed";
import {
  PULLBACK_INSET_M,
  pullBackSeedServeLandings,
  pulledBackServeLanding,
  servePlayedOn,
  type PullbackShot,
} from "@/lib/services/labels/serve-autofix";
import type { LabelStroke } from "@/lib/services/labels/session";
import { deriveShotResult } from "@/lib/services/labels/shot-derived";

const NET_Y = 11.885;

/** A first serve from the near deuce side, stored in. */
function serve(overrides: Partial<PullbackShot> = {}): PullbackShot {
  return {
    stroke: "first_serve",
    result: "in",
    contact_x: 1,
    contact_y: -0.4,
    landing_x: -2,
    landing_y: NET_Y + 7,
    ...overrides,
  };
}

test.describe("pulledBackServeLanding", () => {
  test("pulls a long landing back along its path, inset from the service line", () => {
    const shot = serve();
    const pulled = pulledBackServeLanding(shot);
    expect(pulled).not.toBeNull();
    expect(pulled!.y).toBeCloseTo(NET_Y + 6.4 - PULLBACK_INSET_M, 3);
    // On the line from contact to the vendor's bounce.
    const t =
      (pulled!.y - shot.contact_y!) / (shot.landing_y! - shot.contact_y!);
    expect(pulled!.x).toBeCloseTo(1 + t * (-2 - 1), 3);
    expect(
      deriveShotResult({ ...shot, landing_x: pulled!.x, landing_y: pulled!.y }),
    ).toBe("in");
  });

  test("pulls a wide landing back inside the sideline", () => {
    const pulled = pulledBackServeLanding(
      serve({ landing_x: -4.6, landing_y: NET_Y + 4 }),
    );
    expect(pulled!.x).toBeCloseTo(-(4.115 - PULLBACK_INSET_M), 3);
  });

  test("works from the far end", () => {
    const pulled = pulledBackServeLanding(
      serve({
        contact_x: -1,
        contact_y: 24.2,
        landing_x: 2,
        landing_y: NET_Y - 7,
      }),
    );
    expect(pulled!.y).toBeCloseTo(NET_Y - (6.4 - PULLBACK_INSET_M), 3);
  });

  test("pulls a 1–2 m miss back only when the rally went on", () => {
    const shot = serve({ landing_y: NET_Y + 7.9 });
    expect(pulledBackServeLanding(shot)).toBeNull();
    expect(pulledBackServeLanding(shot, { playedOn: true })!.y).toBeCloseTo(
      NET_Y + 6.4 - PULLBACK_INSET_M,
      3,
    );
  });

  test("leaves alone what a path back cannot fix", () => {
    // Already in.
    expect(pulledBackServeLanding(serve({ landing_y: NET_Y + 5 }))).toBeNull();
    // Called out or a let: the call is not the vendor's in.
    expect(pulledBackServeLanding(serve({ result: "out" }))).toBeNull();
    expect(pulledBackServeLanding(serve({ result: "let" }))).toBeNull();
    // Not a serve.
    expect(pulledBackServeLanding(serve({ stroke: "forehand" }))).toBeNull();
    // On the server's own side.
    expect(pulledBackServeLanding(serve({ landing_y: NET_Y - 3 }))).toBeNull();
    // Inside the wrong service box.
    expect(
      pulledBackServeLanding(serve({ landing_x: 2, landing_y: NET_Y + 4 })),
    ).toBeNull();
    // Too far out to trust the path, even with the rally played on.
    expect(
      pulledBackServeLanding(serve({ landing_y: NET_Y + 9 }), {
        playedOn: true,
      }),
    ).toBeNull();
    // Wide on a path parallel to the sideline.
    expect(
      pulledBackServeLanding(
        serve({ contact_x: -4.5, landing_x: -4.5, landing_y: NET_Y + 4 }),
      ),
    ).toBeNull();
    // An end missing.
    expect(pulledBackServeLanding(serve({ landing_x: null }))).toBeNull();
  });
});

test.describe("servePlayedOn", () => {
  const rally = (...strokes: LabelStroke[]) =>
    strokes.map((stroke) => ({ stroke }));

  test("a serve with three rally strokes after it was played on", () => {
    expect(
      servePlayedOn(
        rally("first_serve", "forehand", "backhand", "forehand"),
        0,
      ),
    ).toBe(true);
  });

  test("not with two strokes after it, nor with a serve next", () => {
    expect(servePlayedOn(rally("first_serve", "forehand", "backhand"), 0)).toBe(
      false,
    );
    expect(
      servePlayedOn(
        rally(
          "first_serve",
          "second_serve",
          "forehand",
          "backhand",
          "forehand",
        ),
        0,
      ),
    ).toBe(false);
  });
});

test.describe("pullBackSeedServeLandings", () => {
  function seedShot(
    overrides: Partial<Omit<LabelShotSeedValues, "hitter">>,
  ): LabelShotSeed {
    const values = {
      hitter: "p1" as const,
      stroke: "forehand" as const,
      result: "in" as const,
      spin: null,
      contact_x: 1,
      contact_y: -0.4,
      landing_x: -2,
      landing_y: NET_Y + 7,
      video_time: null,
      ...overrides,
    };
    return {
      event_id: 1,
      vendor: {} as LabelShotSeed["vendor"],
      status: "kept",
      ...values,
      unclear: [],
      site_removal: null,
      seed: { ...values },
    };
  }
  function seedPoint(shots: LabelShotSeed[]): LabelPointSeed {
    const row = {
      set_number: 1,
      game_number: 1,
      server: "p1" as const,
      winner: null,
      ending: null,
      ended_by: null,
    };
    return {
      point_index: 0,
      vendor_rally_ids: [1],
      ...row,
      game_type: "game",
      status: "unchanged",
      seed: { ...row, serve_side: null, game_type: "game" },
      shots,
    };
  }

  test("writes the pulled-back landing into the row and its frozen seed", () => {
    const [point] = pullBackSeedServeLandings([
      seedPoint([
        seedShot({ stroke: "first_serve" }),
        seedShot({ landing_y: NET_Y - 5 }),
      ]),
    ]);
    const serve = point.shots[0];
    expect(serve.landing_y).toBeCloseTo(NET_Y + 6.4 - PULLBACK_INSET_M, 3);
    expect(serve.seed.landing_x).toBe(serve.landing_x);
    expect(serve.seed.landing_y).toBe(serve.landing_y);
    // The rally stroke after it is untouched.
    expect(point.shots[1].landing_y).toBe(NET_Y - 5);
  });

  test("leaves a point with nothing to move as it was", () => {
    const points = [
      seedPoint([seedShot({ stroke: "first_serve", landing_y: NET_Y + 5 })]),
    ];
    expect(pullBackSeedServeLandings(points)[0]).toBe(points[0]);
  });

  test("a 1–2 m miss moves only when the rally went on, ghosts not counted", () => {
    const serve = seedShot({ stroke: "first_serve", landing_y: NET_Y + 7.9 });
    const rally = [seedShot({}), seedShot({}), seedShot({})];
    const played = pullBackSeedServeLandings([seedPoint([serve, ...rally])])[0];
    expect(played.shots[0].landing_y).not.toBe(NET_Y + 7.9);
    const ghosts = rally.map((s) => ({
      ...s,
      site_removal: "hit_after_fault" as const,
    }));
    const ended = pullBackSeedServeLandings([seedPoint([serve, ...ghosts])])[0];
    expect(ended.shots[0].landing_y).toBe(NET_Y + 7.9);
  });
});
