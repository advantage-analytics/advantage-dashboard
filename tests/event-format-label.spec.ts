import { expect, test } from "@playwright/test";

import { EVENT_FORMATS, formatLabel } from "@/lib/schedule/format";
import type { EventFormat } from "@/lib/schedule/types";

/**
 * The five strings the event page's format capsule can print.
 *
 * Pinned as literals rather than derived, because the point of the assertion is
 * the WORDING: `formatLabel` is the one place a stored `program_events.format`
 * becomes something a coach reads, and a silent drift from "No-Ad Scoring" to
 * "No-ad scoring" is invisible in review and shows up on the page. The fifth
 * string is the one that matters most — `adScoring: null` must drop the scoring
 * half entirely rather than default it to ad or no-ad, which would be a wrong
 * answer that looks like a real one.
 */
test("formatLabel words the four EVENT_FORMATS rows", () => {
  const label = (value: string) => {
    const row = EVENT_FORMATS.find((format) => format.value === value);
    if (!row) throw new Error(`no EVENT_FORMATS row for ${value}`);
    return formatLabel({ bestOf: row.bestOf, adScoring: row.adScoring });
  };

  expect(label("bo3-no-ad")).toBe("Best of 3 Sets · No-Ad Scoring");
  expect(label("bo3-ad")).toBe("Best of 3 Sets · Ad Scoring");
  expect(label("one-set-no-ad")).toBe("One Set · No-Ad Scoring");
  expect(label("one-set-ad")).toBe("One Set · Ad Scoring");
});

test("a null adScoring drops the scoring half rather than guessing it", () => {
  const unchosen: EventFormat = { bestOf: 3, adScoring: null };
  expect(formatLabel(unchosen)).toBe("Best of 3 Sets");
  expect(formatLabel(unchosen)).not.toContain("·");
});
