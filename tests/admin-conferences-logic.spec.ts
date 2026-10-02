import { expect, test } from "@playwright/test";

import {
  applyConferenceView,
  conferenceMeta,
  sortConferences,
  type AdminConferenceRow,
} from "@/lib/data/admin-conferences-view";
import {
  conferenceChanged,
  conferenceInitials,
  normalizeWebsite,
  type ConferenceDraft,
} from "@/lib/services/programs/conference-format";

/**
 * Pure-logic specs for Admin › Conferences (T10): the client-side view/sort/
 * meta helpers in `admin-conferences-view.ts`, and the drawer's formatting
 * helpers in `conference-format.ts`. No I/O, no live DB.
 */

// ---------------------------------------------------------------------------
// applyConferenceView / sortConferences / conferenceMeta
// ---------------------------------------------------------------------------

function row(overrides: Partial<AdminConferenceRow>): AdminConferenceRow {
  const defaults: AdminConferenceRow = {
    id: "id-1",
    name: "Ivy League",
    shortName: "IVY",
    division: "D1",
    website: "ivyleague.com",
    label: "Ivy League (IVY)",
    teams: 8,
    onAdvantage: 0,
    pilot: 0,
    schools: 8,
    squads: "both",
    updatedAt: "2026-01-01T00:00:00Z",
  };
  // A plain `??` merge would treat an explicit `null` override (e.g.
  // shortName: null) as "not provided" and fall back to the default —
  // exactly the value these tests need to set. Only an omitted key falls
  // back.
  return { ...defaults, ...overrides };
}

test.describe("applyConferenceView", () => {
  const rows = [
    row({
      id: "a",
      onAdvantage: 0,
      shortName: "A",
      website: "a.com",
      division: "D1",
    }),
    row({
      id: "b",
      onAdvantage: 2,
      shortName: "B",
      website: "b.com",
      division: "D1",
    }),
    row({
      id: "c",
      onAdvantage: 0,
      shortName: null,
      website: "c.com",
      division: "D1",
    }),
    row({
      id: "d",
      onAdvantage: 1,
      shortName: "D",
      website: null,
      division: "D1",
    }),
    row({
      id: "e",
      onAdvantage: 0,
      shortName: "E",
      website: "e.com",
      division: null,
    }),
  ];

  test('"all" returns every row, unfiltered, as a new array', () => {
    const result = applyConferenceView(rows, "all");
    expect(result).toEqual(rows);
    expect(result).not.toBe(rows);
  });

  test('"on_advantage" keeps only rows with onAdvantage > 0', () => {
    const result = applyConferenceView(rows, "on_advantage");
    expect(result.map((r) => r.id)).toEqual(["b", "d"]);
  });

  test('"missing" keeps rows missing shortName, website, or division', () => {
    const result = applyConferenceView(rows, "missing");
    expect(result.map((r) => r.id)).toEqual(["c", "d", "e"]);
  });

  test("does not mutate the input array", () => {
    const copy = [...rows];
    applyConferenceView(rows, "on_advantage");
    expect(rows).toEqual(copy);
  });
});

test.describe("sortConferences", () => {
  test("most_teams sorts descending by teams, ties broken by name", () => {
    const rows = [
      row({ id: "z", name: "Zeta", teams: 5 }),
      row({ id: "a", name: "Alpha", teams: 5 }),
      row({ id: "m", name: "Mid", teams: 10 }),
    ];
    const result = sortConferences(rows, "most_teams");
    expect(result.map((r) => r.id)).toEqual(["m", "a", "z"]);
  });

  test("name_asc sorts by localeCompare", () => {
    const rows = [
      row({ id: "1", name: "Élan Conference" }),
      row({ id: "2", name: "Big 12 Conference" }),
      row({ id: "3", name: "Atlantic Coast Conference" }),
    ];
    const result = sortConferences(rows, "name_asc");
    const expected = [...rows].sort((a, b) => a.name.localeCompare(b.name));
    expect(result.map((r) => r.id)).toEqual(expected.map((r) => r.id));
  });

  test("does not mutate the input array", () => {
    const rows = [row({ id: "b", teams: 1 }), row({ id: "a", teams: 2 })];
    const copy = [...rows];
    sortConferences(rows, "most_teams");
    expect(rows).toEqual(copy);
  });
});

test.describe("conferenceMeta", () => {
  test("division, plural schools, and both squads", () => {
    expect(conferenceMeta({ division: "D1", schools: 8, squads: "both" })).toBe(
      "Division I · 8 schools, men's and women's",
    );
  });

  test("singular school (1) and men's only", () => {
    expect(conferenceMeta({ division: "D1", schools: 1, squads: "mens" })).toBe(
      "Division I · 1 school, men's only",
    );
  });

  test("women's only, zero schools drops the schools part", () => {
    expect(
      conferenceMeta({ division: "D2", schools: 0, squads: "womens" }),
    ).toBe("Division II · women's only");
  });

  test("no squads and no schools drops the whole composition half", () => {
    expect(conferenceMeta({ division: "D3", schools: 0, squads: null })).toBe(
      "Division III",
    );
  });

  test("null division drops the division half", () => {
    expect(conferenceMeta({ division: null, schools: 4, squads: "both" })).toBe(
      "4 schools, men's and women's",
    );
  });
});

// ---------------------------------------------------------------------------
// conferenceInitials
// ---------------------------------------------------------------------------

test.describe("conferenceInitials", () => {
  test("a short name that fits (<= 3 chars) is used verbatim, upper-cased", () => {
    expect(conferenceInitials("Southeastern Conference", "SEC")).toBe("SEC");
  });

  test("falls back to initials of the name when shortName is null", () => {
    expect(conferenceInitials("Big 12 Conference", null)).toBe("B12");
  });

  test("a short name longer than 3 characters falls back to initials of the name", () => {
    expect(conferenceInitials("Atlantic Coast Conference", "ACCC")).toBe("AC");
  });
});

// ---------------------------------------------------------------------------
// normalizeWebsite
// ---------------------------------------------------------------------------

test.describe("normalizeWebsite", () => {
  test("strips scheme, trailing slash, and lower-cases the host", () => {
    expect(normalizeWebsite("https://IvyLeague.com/")).toBe("ivyleague.com");
  });

  test("input with no dotted host is not a url", () => {
    expect(normalizeWebsite("not a url")).toBeNull();
  });

  test("empty or whitespace-only input is null", () => {
    expect(normalizeWebsite("   ")).toBeNull();
    expect(normalizeWebsite("")).toBeNull();
    expect(normalizeWebsite(null)).toBeNull();
    expect(normalizeWebsite(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// conferenceChanged
// ---------------------------------------------------------------------------

function draft(overrides: Partial<ConferenceDraft>): ConferenceDraft {
  const defaults: ConferenceDraft = {
    name: "Ivy League",
    shortName: "IVY",
    division: "D1",
    website: "ivyleague.com",
  };
  // Same reasoning as row()'s helper above: spread-merge so an explicit
  // `null` override is respected instead of being treated as "not provided".
  return { ...defaults, ...overrides };
}

test.describe("conferenceChanged", () => {
  test("identical drafts are not a change", () => {
    const saved = draft({});
    expect(conferenceChanged(saved, draft({}))).toBe(false);
  });

  test("whitespace-only edits are not a change", () => {
    const saved = draft({ name: "Ivy League" });
    expect(conferenceChanged(saved, draft({ name: "  Ivy League  " }))).toBe(
      false,
    );
  });

  test("null and empty string are not a change", () => {
    const saved = draft({ shortName: null });
    expect(conferenceChanged(saved, draft({ shortName: "" }))).toBe(false);

    const saved2 = draft({ shortName: "" });
    expect(conferenceChanged(saved2, draft({ shortName: null }))).toBe(false);
  });

  test("a real edit is a change", () => {
    const saved = draft({ website: "ivyleague.com" });
    expect(conferenceChanged(saved, draft({ website: "ivy.edu" }))).toBe(true);
  });
});
