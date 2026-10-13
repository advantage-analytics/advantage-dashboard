import { expect, test } from "@playwright/test";

import { crestLetters } from "@/lib/ui/crest-letters";

test.describe("crestLetters", () => {
  test("a 1-3 character short code is used as is", () => {
    expect(crestLetters("UCI", "UC Irvine")).toBe("UCI");
    expect(crestLetters("ND", "Notre Dame")).toBe("ND");
  });

  test("a four-character code falls back to the name's initials", () => {
    expect(crestLetters("STAN", "Stanford University")).toBe("SU");
  });

  test("empty or missing code falls back to the initials", () => {
    expect(crestLetters("", "Wake Forest")).toBe("WF");
    expect(crestLetters("   ", "Wake Forest")).toBe("WF");
    expect(crestLetters(null, "Wake Forest")).toBe("WF");
    expect(crestLetters(undefined, "Wake Forest")).toBe("WF");
  });

  test("a one-word name gives its initial, never more than three letters", () => {
    expect(crestLetters(null, "Stanford")).toBe("S");
    expect(crestLetters(null, "Stanford").length).toBeLessThanOrEqual(3);
  });

  test("whitespace is trimmed and case normalised", () => {
    expect(crestLetters("  uci ", "UC Irvine")).toBe("UCI");
    expect(crestLetters("uc", "UC Irvine")).toBe("UC");
  });
});
