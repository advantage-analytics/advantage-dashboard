import { expect, test } from "@playwright/test";

import {
  FORMATS,
  formatOptions,
} from "@/components/dashboard/schedule/static/dual-build-step";

/**
 * The Format cell is the one input on the dual builder that decides
 * `adScoring` — the field `docs/ui-revamp-guardrails.md` §3.1 and §4 exist
 * about. A null coerced to `false` there is a wrong answer that looks like a
 * real one, and it is only caught long afterwards, at vendor submission.
 *
 * The control is a `MenuSelect`, so its options are data rather than markup,
 * and this drives that data directly: the mapping from a `FORMATS` row to the
 * option the coach reads, and the way back. What matters is that the option
 * carries a NAME and nothing else — no encoded scoring rule to parse — and
 * that resolving the name lands on a row whose `adScoring` is a real boolean.
 */
test.describe("dual Format options", () => {
  test("one option per format, worded off its row", () => {
    const options = formatOptions(FORMATS);

    expect(options).toHaveLength(4);
    expect(FORMATS).toHaveLength(4);

    options.forEach((option, index) => {
      const row = FORMATS[index];
      // The trigger prints `sets`, the menu row's second line prints
      // `scoring` — `2b`'s two halves, both read off the same row, so the
      // closed cell and the open menu cannot word one format differently.
      expect(option.value).toBe(row.value);
      expect(option.label).toBe(row.sets);
      expect(option.description).toBe(row.scoring);
    });
  });

  test("an option carries a name, never a scoring rule", () => {
    for (const option of formatOptions(FORMATS)) {
      // Three keys and no fourth. `bestOf`/`adScoring` on an option would be a
      // second place to read the rule from, and the one the UI reaches first.
      expect(Object.keys(option).sort()).toEqual([
        "description",
        "label",
        "value",
      ]);
    }
  });

  test("every option resolves to a row stating adScoring as a literal", () => {
    for (const option of formatOptions(FORMATS)) {
      // The lookup `DualFactsStep` performs on change, run over every option
      // the coach can pick. A miss would leave `format` unassigned; a row
      // whose `adScoring` is null or a string is the §4 failure itself.
      const chosen = FORMATS.find((row) => row.value === option.value);

      expect(chosen, `no FORMATS row for ${option.value}`).toBeTruthy();
      expect(typeof chosen!.adScoring).toBe("boolean");
      expect(chosen!.adScoring === true || chosen!.adScoring === false).toBe(
        true,
      );
      expect(typeof chosen!.bestOf).toBe("number");
    }
  });
});
