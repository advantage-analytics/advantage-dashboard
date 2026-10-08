/**
 * The sample match, typed — what `/dashboard/matches/sample` renders.
 *
 * `fixture.json` is `scripts/build-sample-match.ts`'s output: one real match
 * read through the loaders behind `getMatchDetailData()` and passed through
 * `anonymiseMatchDetail` (`./anonymise.ts`), committed so the page needs no
 * database at all. This module is the only reader of that file, and the one
 * place its shape is turned back into the loader's.
 *
 * Nothing here touches `matches` or any other table: the page must not — its
 * placeholder ids name no row — and `tests/match-layout-skeleton.spec.ts`
 * pins that `getMatchDetailData()` has exactly two callers, neither of them
 * this.
 */

import type { MatchDetailData } from "@/lib/data/match-detail-server";
import type { MatchPoint } from "@/lib/data/match-points-server";
import type { MatchVideo } from "@/lib/data/match-video-server";
import { SAMPLE_VIDEO_ATTACHMENT } from "@/lib/services/sample-match/video";

import type { SampleMatchData } from "./anonymise";
import fixture from "./fixture.json";

/**
 * `getMatchDetailData()`'s shape with the one narrowing a static fixture can
 * promise: the points are an array. `null` there means a failed read, which a
 * committed file cannot have.
 */
export type SampleMatchDetail = MatchDetailData & { points: MatchPoint[] };

/**
 * `T` with every string literal widened to `string`, recursively — the shape
 * TypeScript gives a JSON import, where `"player1"` is just a string. Nothing
 * else is loosened: a missing field, a `number` where the loader has a
 * string, a `null` the loader does not allow, all still fail.
 */
type Widen<T> = T extends string
  ? string
  : T extends readonly (infer Item)[]
    ? Widen<Item>[]
    : T extends object
      ? { [Key in keyof T]: Widen<T[Key]> }
      : T;

/**
 * The fixture as the anonymiser wrote it. A plain assignment, not a cast, so
 * `npm run typecheck` is what proves the committed file still has the
 * loader's shape — a field the loader gains, or one the script drops, fails
 * here and nowhere at runtime. The loader's two string-literal unions
 * (`match.score.winner`, `points[].player`) are the one thing a JSON import
 * cannot carry; {@link seat} narrows them at load and refuses anything else.
 *
 * JSON cannot carry a `Date` either, and none of the loader's fields is one
 * (every date on the report is pre-formatted text; `points[].videoTime` and
 * friends are numbers), so nothing needs re-hydrating — `sampleMatchData()`
 * is still the one place that would happen.
 */
const FIXTURE: Widen<SampleMatchData> = fixture;

/** The fixture's placeholder match id — the first id the anonymiser handed out. */
export const SAMPLE_MATCH_ID: string = FIXTURE.match.id;

/** The loader's seat literal, from the string the file carries. */
function seat(value: string, where: string): "player1" | "player2" {
  if (value === "player1" || value === "player2") return value;
  throw new Error(`sample match: ${where} is "${value}", not a seat`);
}

/**
 * The internal provider name the report's components branch on
 * (`isDerivedMatch`, the film court overlay, the provider fact). The
 * anonymiser rewrites every string, this one included, to the product name,
 * and `assertSampleClean` refuses the file if it survived — so it is mapped
 * back here, at load time, where the string never reaches the screen as text.
 */
const DERIVED_PROVIDER = "splitstep";

/**
 * The sample match in `getMatchDetailData()`'s shape, for `MatchDataProvider`
 * and the report's parts. A deep copy per call — the fixture is a module
 * singleton shared by every request, and a nested object handed out by
 * reference would carry one render's mutation into the next.
 *
 * Two fields are re-shaped on the way out:
 *
 * - `match.sourceProvider` is `"splitstep"` again (see {@link DERIVED_PROVIDER}).
 * - `kpiHistory` is `null`: the fixture writes `[]` (the anonymiser's "no
 *   history to draw a baseline from"), but every consumer types it
 *   `MatchKpiHistory | null`, and `null` is what the KPI tiles already read
 *   as "no baseline".
 */
export function sampleMatchData(): SampleMatchDetail {
  const {
    match,
    points,
    kpiHistory: _history,
    ...rest
  } = structuredClone(FIXTURE);
  void _history;
  return {
    ...rest,
    match: {
      ...match,
      score: {
        ...match.score,
        winner: seat(match.score.winner, "match.score.winner"),
      },
      sourceProvider: DERIVED_PROVIDER,
    },
    points: (points ?? []).map((point, i) => ({
      ...point,
      player: seat(point.player, `points[${i}].player`),
    })),
    kpiHistory: null,
  };
}

/**
 * The Film view's input for the sample, built here rather than through
 * `getMatchVideo()` — which reads `matches` and `match_video_attachments`,
 * neither of which has a row for a placeholder id.
 *
 * It carries no playable URL. The credential is minted per viewer by
 * `GET /api/sample-match/video` (`MatchReportMeta.playbackEndpoint`), which
 * the Film view's playback hook already polls for an attachment: an expiry
 * in the past makes its first scheduled renewal fire within a second of
 * mounting, and the empty `src` — which the element refuses at once — spends
 * the hook's recovery attempt on that same renewal, so the first load asks
 * the sample route rather than waiting on a timer. The attachment id and
 * version are {@link SAMPLE_VIDEO_ATTACHMENT}'s, the pair the route answers
 * with, so that first renewal reads as "same video, fresh URL" and never as a
 * replacement. A route that refuses — Azure unconfigured, the clip not yet
 * uploaded — lands on the view's unavailable state, exactly as a real match's
 * would.
 */
export function sampleMatchVideo(): MatchVideo {
  return {
    url: "",
    expiresAt: new Date(0).toISOString(),
    startTimeSeconds: SAMPLE_VIDEO_ATTACHMENT.offsetSeconds,
    source: "attachment",
    attachment: {
      id: SAMPLE_VIDEO_ATTACHMENT.id,
      version: SAMPLE_VIDEO_ATTACHMENT.version,
      durationSeconds: SAMPLE_VIDEO_ATTACHMENT.durationSeconds,
      contentType: SAMPLE_VIDEO_ATTACHMENT.contentType,
      filename: SAMPLE_VIDEO_ATTACHMENT.filename,
      // No retention clock: the clip is nobody's upload and is never swept.
      expiresAt: null,
      monthsUnwatched: null,
      expiryWarning: false,
    },
  };
}
