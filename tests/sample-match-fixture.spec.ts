import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

import {
  anonymiseMatchDetail,
  assertSampleClean,
  isSampleId,
  SAMPLE_NAMES,
  type SampleMatchData,
} from "@/lib/sample-match/anonymise";
import {
  SAMPLE_MATCH_ID,
  sampleMatchData,
  sampleMatchVideo,
} from "@/lib/sample-match";
import { SAMPLE_VIDEO_ATTACHMENT } from "@/lib/services/sample-match/video";
import {
  REAL_MATCH_ID,
  REAL_POINT_IDS,
  REAL_PROGRAM_ID,
  REAL_SHOT_ID,
  REAL_UPLOADER_ID,
  SYNTHETIC_MATCH_DETAIL,
} from "./fixtures/sample-match-synthetic";

const FIXTURE_PATH = "src/lib/sample-match/fixture.json";
const BANNED = /rudy|quan|goodman|ucla|splitstep/i;
const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Every uuid-shaped string anywhere in a JSON-shaped value. */
function allIds(value: unknown): string[] {
  return JSON.stringify(value).match(UUID_RE) ?? [];
}

/** Every string anywhere in a JSON-shaped value. */
function allStrings(value: unknown): string[] {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === "string") out.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === "object")
      Object.values(node as object).forEach(walk);
  };
  walk(value);
  return out;
}

/** The score as "you" would say it, one `[yours, theirs]` pair per set. */
function scoreFromYourSide(match: SampleMatchData["match"]): number[][] {
  return match.score.sets.map((set) =>
    match.isUserPlayer1
      ? [set.player1, set.player2]
      : [set.player2, set.player1],
  );
}

test.describe("anonymiseMatchDetail", () => {
  const sample = anonymiseMatchDetail(SYNTHETIC_MATCH_DETAIL);

  test("no banned string survives anywhere in the output", () => {
    const offenders = allStrings(sample).filter((text) => BANNED.test(text));
    expect(offenders).toEqual([]);
    expect(() => assertSampleClean(sample)).not.toThrow();
  });

  test("both players are renamed in every place a name appears", () => {
    expect(sample.match.player1.name).toBe(SAMPLE_NAMES.player1);
    expect(sample.match.player2.name).toBe(SAMPLE_NAMES.player2);
    expect(sample.statsResult?.player1Name).toBe(SAMPLE_NAMES.player1);
    expect(sample.statsResult?.player2Name).toBe(SAMPLE_NAMES.player2);
    expect(sample.insights?.player1?.summary).toContain("Jordan Avery");
    expect(sample.insights?.player1?.summary).toContain("Sam Ellis");
    expect(sample.insights?.player1?.strengths?.[0]?.description).toContain(
      "Avery's",
    );
    expect(sample.keyMoments[0]?.description).toContain("Jordan broke Ellis");
    expect(sample.points?.[1]?.description).toContain("Ellis backhand");
  });

  test("custom names are honoured", () => {
    const renamed = anonymiseMatchDetail(SYNTHETIC_MATCH_DETAIL, {
      player1: "Alex Reed",
      player2: "Casey Lane",
    });
    expect(renamed.match.player1.name).toBe("Alex Reed");
    expect(renamed.keyMoments[0]?.description).toContain("Alex broke Lane");
  });

  test("every id is a placeholder, deterministic per source id", () => {
    const ids = allIds(sample);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every(isSampleId)).toBe(true);
    for (const real of [
      REAL_MATCH_ID,
      REAL_PROGRAM_ID,
      REAL_UPLOADER_ID,
      REAL_SHOT_ID,
      ...REAL_POINT_IDS,
    ]) {
      expect(JSON.stringify(sample)).not.toContain(real);
    }
    // Two points keep two distinct ids; a rebuild hands out the same ones.
    expect(sample.points?.[0]?.id).not.toBe(sample.points?.[1]?.id);
    const again = anonymiseMatchDetail(SYNTHETIC_MATCH_DETAIL);
    expect(again.match.id).toBe(sample.match.id);
    expect(again.points?.map((p) => p.id)).toEqual(
      sample.points?.map((p) => p.id),
    );
  });

  test("drops the program, event, uploader and bookmark ties", () => {
    expect("programId" in sample.match).toBe(false);
    expect("eventId" in sample.match).toBe(false);
    expect("uploadedBy" in sample.match).toBe(false);
    expect(
      sample.points?.every((p) => !p.saved && p.savedBy.length === 0),
    ).toBe(true);
  });

  test("pins the viewer to seat one and ships no KPI history", () => {
    expect(sample.match.isUserPlayer1).toBe(true);
    // The synthetic viewer was seat two and lost; seat one won 6-2 6-2.
    expect(sample.match.won).toBe(true);
    expect(sample.kpiHistory).toEqual([]);
    expect(sample.foldUnreconciled).toBe(
      SYNTHETIC_MATCH_DETAIL.foldUnreconciled,
    );
  });

  test("names the vendor as the product does", () => {
    expect(sample.match.sourceProvider).toBe("Advantage Intelligence");
  });

  test("leaves the input untouched", () => {
    expect(SYNTHETIC_MATCH_DETAIL.match.player1.name).toBe("Rudy Quan");
    expect(SYNTHETIC_MATCH_DETAIL.match.isUserPlayer1).toBe(false);
    expect(SYNTHETIC_MATCH_DETAIL.points?.[0]?.saved).toBe(true);
  });
});

test.describe("assertSampleClean", () => {
  test("throws on the unanonymised input, naming the first offender", () => {
    // The walk reaches the match's real id before its player names.
    expect(() => assertSampleClean(SYNTHETIC_MATCH_DETAIL)).toThrow(
      /not clean: uuid bca90097-72c9-448b-b0e4-e0e83dc143d9 at \$\.match\.id/,
    );
    expect(() => assertSampleClean({ player: "Rudy Quan" })).toThrow(
      /not clean: "Rudy" found at \$\.player/,
    );
  });

  test("throws on a real uuid even when every name is clean", () => {
    expect(() =>
      assertSampleClean({ id: REAL_MATCH_ID, name: SAMPLE_NAMES.player1 }),
    ).toThrow(/uuid bca90097-72c9-448b-b0e4-e0e83dc143d9 at \$\.id/);
  });

  test("is case-insensitive", () => {
    expect(() => assertSampleClean(["a SPLITSTEP match"])).toThrow(
      /"splitstep" found at \$\[0\]/,
    );
  });
});

test.describe("committed fixture", () => {
  test.skip(
    !existsSync(FIXTURE_PATH),
    `${FIXTURE_PATH} not committed yet — run scripts/build-sample-match.ts (H3)`,
  );

  test("is the clean 6-2 6-2 sample match", () => {
    const fixture = JSON.parse(
      readFileSync(FIXTURE_PATH, "utf8"),
    ) as SampleMatchData;

    expect(() => assertSampleClean(fixture)).not.toThrow();
    expect(fixture.points?.length).toBe(87);
    expect(fixture.match.isUserPlayer1).toBe(true);
    expect(scoreFromYourSide(fixture.match)).toEqual([
      [6, 2],
      [6, 2],
    ]);
    expect(fixture.match.won).toBe(true);
    expect(fixture.kpiHistory).toEqual([]);

    const ids = allIds(fixture);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every(isSampleId)).toBe(true);
    expect(fixture.match.player1.name).toBe(SAMPLE_NAMES.player1);
    expect(fixture.match.player2.name).toBe(SAMPLE_NAMES.player2);
    expect("programId" in fixture.match).toBe(false);
    expect("eventId" in fixture.match).toBe(false);
    expect("uploadedBy" in fixture.match).toBe(false);
  });
});

test.describe("sampleMatchData", () => {
  test.skip(
    !existsSync(FIXTURE_PATH),
    `${FIXTURE_PATH} not committed yet — run scripts/build-sample-match.ts (H3)`,
  );

  test("round-trips the fixture into the loader's shape", () => {
    const data = sampleMatchData();
    const fixture = JSON.parse(
      readFileSync(FIXTURE_PATH, "utf8"),
    ) as SampleMatchData;

    expect(SAMPLE_MATCH_ID).toBe(fixture.match.id);
    expect(isSampleId(SAMPLE_MATCH_ID)).toBe(true);
    expect(data.match.id).toBe(SAMPLE_MATCH_ID);
    // The anonymiser names the vendor as the product does; the report's
    // components branch on the internal name, so it is mapped back on load.
    expect(fixture.match.sourceProvider).toBe("Advantage Intelligence");
    expect(data.match.sourceProvider).toBe("splitstep");
    // `[]` in the file, `null` to the consumers that type it so.
    expect(fixture.kpiHistory).toEqual([]);
    expect(data.kpiHistory).toBeNull();
    expect(data.match.isUserPlayer1).toBe(true);
    expect(data.match.won).toBe(true);
    expect(data.points).toHaveLength(87);
    expect(data.foldUnreconciled).toBe(fixture.foldUnreconciled);
    expect(data.keyMoments).toEqual(fixture.keyMoments);
    expect(data.insights).toEqual(fixture.insights);
    expect(data.statsResult).toEqual(fixture.statsResult);
    // The loader's two seat literals, narrowed from the file's strings.
    expect(["player1", "player2"]).toContain(data.match.score.winner);
    for (const point of data.points)
      expect(["player1", "player2"]).toContain(point.player);
  });

  test("hands out a fresh object each time, leaving the fixture untouched", () => {
    const first = sampleMatchData();
    first.match.player1.name = "Edited";
    first.points[0]!.saved = true;
    const second = sampleMatchData();
    expect(second.match.player1.name).toBe(SAMPLE_NAMES.player1);
    expect(second.points[0]!.saved).toBe(false);
    expect(second).not.toBe(first);
    expect(second.points).not.toBe(first.points);
  });

  test("the sample video is the route's attachment with no credential yet", () => {
    const video = sampleMatchVideo();
    expect(video.source).toBe("attachment");
    expect(video.attachment?.id).toBe(SAMPLE_VIDEO_ATTACHMENT.id);
    expect(video.attachment?.version).toBe(SAMPLE_VIDEO_ATTACHMENT.version);
    expect(isSampleId(video.attachment?.id ?? "")).toBe(true);
    expect(video.url).toBe("");
    // Already expired, so the Film view's first scheduled renewal fires at
    // once and asks `/api/sample-match/video` for the real credential.
    expect(Date.parse(video.expiresAt)).toBeLessThan(Date.now());
    expect(video.attachment?.expiryWarning).toBe(false);
  });
});
