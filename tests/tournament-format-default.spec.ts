import { expect, test } from "@playwright/test";

import { createLoader } from "./fixtures/vm-modules";

/**
 * T1: the tournament builder's format default, and that an existing Ad
 * tournament is unaffected.
 *
 * `useTournamentDraft` resolves `TournamentDraftSeed.format` through
 * `formatFor` (`static-tournament-builder.tsx`) — a lookup into `FORMATS`,
 * never a `"<bestOf>|<adScoring>"` string (see that file's `TournamentFormat`
 * header and `docs/ui-revamp-guardrails.md` §3.1/§4). `formatFor` is exported
 * for exactly this: asserting the resolved `{ bestOf, adScoring }` object a
 * seed produces — the same call `useTournamentDraft` makes when it opens the
 * draft (`format: formatFor(initial?.format)`) — without rendering the
 * ~1400-line client component or decoding an encoded string.
 *
 * No-ad is the new default so an upload attributed to a fresh tournament match
 * never carries a stray `adScoring: true` into the wizard's attribution
 * inputs; an Ad tournament that was already saved must keep opening as Ad.
 */

const loader = createLoader();
const { formatFor } = loader.load(
  "src/components/dashboard/schedule/static/static-tournament-builder.tsx",
) as {
  formatFor: (value: string | undefined) => {
    bestOf: number;
    adScoring: boolean;
  };
};

test("a seed with no format resolves to best-of-3, no-ad", () => {
  const format = formatFor(undefined);
  expect(format.adScoring).toBe(false);
  expect(format.bestOf).toBe(3);
});

test("a seed naming the saved Ad format still resolves to Ad", () => {
  const format = formatFor("bo3-ad");
  expect(format.adScoring).toBe(true);
  expect(format.bestOf).toBe(3);
});
