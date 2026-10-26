import { expect, test } from "@playwright/test";

import {
  editDistance,
  suggestSchoolEmail,
} from "@/lib/services/programs/domain-typo";

/**
 * The claim form's "Did you mean …?" — a mistyped school domain bounced the
 * only confirmation link a UTPB coach was sent, and nothing told them.
 */
const UTPB = {
  primary_domain: "utpb.edu",
  athletics_domains: [] as string[],
};

test.describe("suggestSchoolEmail", () => {
  test("offers the listed domain for a one-letter slip", () => {
    expect(suggestSchoolEmail("perez_d81630@utpd.edu", UTPB)).toBe(
      "perez_d81630@utpb.edu",
    );
  });

  test("catches swapped letters, a dropped letter and a clipped suffix", () => {
    for (const typed of ["c@uptb.edu", "c@utb.edu", "c@utpb.ed"]) {
      expect(suggestSchoolEmail(typed, UTPB)).toBe("c@utpb.edu");
    }
  });

  test("keeps the local part exactly as typed, lowercased", () => {
    expect(suggestSchoolEmail("  Coach.Smith@UTPD.edu ", UTPB)).toBe(
      "coach.smith@utpb.edu",
    );
  });

  test("says nothing when the address is already right", () => {
    expect(suggestSchoolEmail("c@utpb.edu", UTPB)).toBeNull();
    expect(suggestSchoolEmail("c@athletics.utpb.edu", UTPB)).toBeNull();
  });

  test("finds a typo under a subdomain", () => {
    expect(suggestSchoolEmail("c@mail.utpd.edu", UTPB)).toBe("c@utpb.edu");
  });

  test("says nothing for a personal address or an unrelated school", () => {
    expect(suggestSchoolEmail("c@gmail.com", UTPB)).toBeNull();
    expect(suggestSchoolEmail("c@ucla.edu", UTPB)).toBeNull();
  });

  test("short domains allow one edit, long ones two", () => {
    const utk = { primary_domain: "utk.edu" };
    expect(suggestSchoolEmail("c@utx.edu", utk)).toBe("c@utk.edu");
    expect(suggestSchoolEmail("c@uxx.edu", utk)).toBeNull();

    const long = { primary_domain: "stanford-alumni.edu" };
    expect(suggestSchoolEmail("c@stanfrd-alumi.edu", long)).toBe(
      "c@stanford-alumni.edu",
    );
  });

  test("checks athletics domains too, preferring the primary on a tie", () => {
    const program = {
      primary_domain: "wisc.edu",
      athletics_domains: ["uwbadgers.com"],
    };
    expect(suggestSchoolEmail("c@uwbadger.com", program)).toBe(
      "c@uwbadgers.com",
    );
    expect(
      suggestSchoolEmail("c@abc.edu", {
        primary_domain: "abd.edu",
        athletics_domains: "abe.edu",
      }),
    ).toBe("c@abd.edu");
  });

  test("says nothing without a recorded domain or a whole address", () => {
    expect(suggestSchoolEmail("c@utpd.edu", {})).toBeNull();
    expect(suggestSchoolEmail("c@utpd", UTPB)).toBeNull();
    expect(suggestSchoolEmail("utpd.edu", UTPB)).toBeNull();
    expect(suggestSchoolEmail(null, UTPB)).toBeNull();
  });
});

test.describe("editDistance", () => {
  test("counts a neighbour swap as one edit", () => {
    expect(editDistance("utpb", "uptb")).toBe(1);
    expect(editDistance("utpb.edu", "utpd.edu")).toBe(1);
    expect(editDistance("", "abc")).toBe(3);
    expect(editDistance("same", "same")).toBe(0);
  });
});
