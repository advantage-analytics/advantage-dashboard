import { expect, test } from "@playwright/test";

import {
  type ExistingContact,
  staleScrapeContacts,
} from "../scripts/lib/contact-prune";

/**
 * `seed-programs.ts --apply` deletes whatever `staleScrapeContacts` returns
 * from `program_contacts`. These tests pin what keeps that safe: only scraped
 * rows, only on programs the dataset covers, compared the way the unique index
 * compares (lowercased), and nothing at all from an empty dataset.
 */

const PROGRAM_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROGRAM_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const row = (
  id: string,
  program_id: string,
  email: string,
  source: "scrape" | "admin" = "scrape",
): ExistingContact => ({ id, program_id, email, source });

test.describe("staleScrapeContacts", () => {
  test("a scraped contact who left the program is pruned", () => {
    const existing = [
      row("stays", PROGRAM_A, "coach@school.edu"),
      row("left", PROGRAM_A, "former@school.edu"),
    ];
    const dataset = new Map([[PROGRAM_A, ["coach@school.edu"]]]);

    expect(staleScrapeContacts(existing, dataset)).toEqual(["left"]);
  });

  test("an admin row is never pruned, even with an email the dataset lacks", () => {
    const existing = [row("admin", PROGRAM_A, "former@school.edu", "admin")];
    const dataset = new Map([[PROGRAM_A, ["coach@school.edu"]]]);

    expect(staleScrapeContacts(existing, dataset)).toEqual([]);
  });

  test("a scraped row on a program absent from the dataset is left alone", () => {
    const existing = [row("elsewhere", PROGRAM_B, "someone@other.edu")];
    const dataset = new Map([[PROGRAM_A, ["coach@school.edu"]]]);

    expect(staleScrapeContacts(existing, dataset)).toEqual([]);
  });

  test("an email differing only in case or whitespace is not pruned", () => {
    const existing = [
      row("upper", PROGRAM_A, "Coach@School.EDU"),
      row("padded", PROGRAM_A, "  assistant@school.edu "),
    ];
    const dataset = new Map([
      [PROGRAM_A, [" coach@school.edu", "ASSISTANT@school.edu  "]],
    ]);

    expect(staleScrapeContacts(existing, dataset)).toEqual([]);
  });

  test("an empty dataset prunes nothing", () => {
    const existing = [
      row("one", PROGRAM_A, "coach@school.edu"),
      row("two", PROGRAM_B, "someone@other.edu"),
    ];

    expect(staleScrapeContacts(existing, new Map())).toEqual([]);
  });
});
