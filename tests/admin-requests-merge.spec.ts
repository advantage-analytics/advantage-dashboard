import { expect, test } from "@playwright/test";

import {
  cursorFor,
  mergeRequestRows,
  parseCursor,
  type AdminRequestRow,
} from "@/lib/data/admin-requests-server";

/**
 * The Admin › Requests merge (T13) — pure, no I/O.
 *
 * `mergeRequestRows` k-way merges two already-sorted feeds (`program_claims`,
 * `program_requests`) into one page. The interesting cases are the ones a
 * naive "concat then sort" would get wrong at scale (it wouldn't, but a naive
 * cursor built from a raw `created_at` alone would): two rows from different
 * tables sharing the exact same timestamp, and the cutoff/`nextCursor`
 * arithmetic at a page boundary.
 */

function row(
  overrides: Partial<AdminRequestRow> & {
    id: string;
    date: string;
    source: "claim" | "request";
  },
): AdminRequestRow {
  return {
    team: "Stanford Women's Tennis",
    crestUrl: null,
    for: "Head coach",
    from: { name: "Test Person", email: "test@example.com" },
    emailCheck: "none",
    status: "pending_review",
    detail: { source: "claim" } as AdminRequestRow["detail"],
    ...overrides,
  };
}

test.describe("mergeRequestRows interleaving", () => {
  test("interleaves two feeds by created_at desc", () => {
    const claims = [
      row({ id: "c1", date: "2026-09-10T12:00:00.000Z", source: "claim" }),
      row({ id: "c2", date: "2026-09-08T12:00:00.000Z", source: "claim" }),
    ];
    const requests = [
      row({ id: "r1", date: "2026-09-09T12:00:00.000Z", source: "request" }),
      row({ id: "r2", date: "2026-09-07T12:00:00.000Z", source: "request" }),
    ];

    const page = mergeRequestRows(claims, requests, 10);
    expect(page.rows.map((r) => r.id)).toEqual(["c1", "r1", "c2", "r2"]);
    expect(page.nextCursor).toBeNull();
  });

  test("claim sorts before request at an identical timestamp", () => {
    const claims = [
      row({ id: "c1", date: "2026-09-10T12:00:00.000Z", source: "claim" }),
    ];
    const requests = [
      row({ id: "r1", date: "2026-09-10T12:00:00.000Z", source: "request" }),
    ];

    const page = mergeRequestRows(claims, requests, 10);
    expect(page.rows.map((r) => r.id)).toEqual(["c1", "r1"]);
  });

  test("is stable within a single already-sorted feed (does not re-sort a source's own ties)", () => {
    // `mergeRequestRows` trusts each input to already be in
    // (created_at desc, id asc) order — the id tie-break at equal
    // timestamps is the query's `.order("id", { ascending: true })`, not
    // something the merge re-derives. Interleaving a request between two
    // same-timestamp claims should not disturb the claims' relative order.
    const claims = [
      row({ id: "a", date: "2026-09-10T12:00:00.000Z", source: "claim" }),
      row({ id: "b", date: "2026-09-10T12:00:00.000Z", source: "claim" }),
    ];
    const requests = [
      row({ id: "r1", date: "2026-09-09T12:00:00.000Z", source: "request" }),
    ];

    const page = mergeRequestRows(claims, requests, 10);
    expect(page.rows.map((r) => r.id)).toEqual(["a", "b", "r1"]);
  });

  test("one feed exhausted before the other drains the remainder", () => {
    const claims = [
      row({ id: "c1", date: "2026-09-10T12:00:00.000Z", source: "claim" }),
    ];
    const requests = [
      row({ id: "r1", date: "2026-09-09T12:00:00.000Z", source: "request" }),
      row({ id: "r2", date: "2026-09-08T12:00:00.000Z", source: "request" }),
      row({ id: "r3", date: "2026-09-07T12:00:00.000Z", source: "request" }),
    ];

    const page = mergeRequestRows(claims, requests, 10);
    expect(page.rows.map((r) => r.id)).toEqual(["c1", "r1", "r2", "r3"]);
  });
});

test.describe("mergeRequestRows cursor cutoff", () => {
  test("cuts to `limit` and reports a cursor pointing at the boundary row", () => {
    const claims = [
      row({ id: "c1", date: "2026-09-10T12:00:00.000Z", source: "claim" }),
      row({ id: "c2", date: "2026-09-08T12:00:00.000Z", source: "claim" }),
    ];
    const requests = [
      row({ id: "r1", date: "2026-09-09T12:00:00.000Z", source: "request" }),
      row({ id: "r2", date: "2026-09-07T12:00:00.000Z", source: "request" }),
    ];

    // limit 2 → merged order is c1, r1, c2, r2 — page should be [c1, r1]
    const page = mergeRequestRows(claims, requests, 2);
    expect(page.rows.map((r) => r.id)).toEqual(["c1", "r1"]);
    expect(page.nextCursor).not.toBeNull();
    expect(parseCursor(page.nextCursor!)).toEqual({
      date: "2026-09-09T12:00:00.000Z",
      source: "request",
      id: "r1",
    });
  });

  test("no cursor when the combined feed exactly fills the page", () => {
    const claims = [
      row({ id: "c1", date: "2026-09-10T12:00:00.000Z", source: "claim" }),
    ];
    const requests = [
      row({ id: "r1", date: "2026-09-09T12:00:00.000Z", source: "request" }),
    ];

    const page = mergeRequestRows(claims, requests, 2);
    expect(page.rows).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  test("no cursor when both feeds are empty", () => {
    const page = mergeRequestRows([], [], 10);
    expect(page.rows).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });
});

test.describe("cursorFor / parseCursor round-trip (requests cursor)", () => {
  test("round-trips a claim-sourced cursor", () => {
    const key = {
      date: "2026-09-10T12:00:00.000Z",
      source: "claim" as const,
      id: "abc-123",
    };
    expect(parseCursor(cursorFor(key))).toEqual(key);
  });

  test("round-trips a request-sourced cursor", () => {
    const key = {
      date: "2026-09-10T12:00:00.000Z",
      source: "request" as const,
      id: "abc-456",
    };
    expect(parseCursor(cursorFor(key))).toEqual(key);
  });

  test("throws on a cursor nobody produced", () => {
    expect(() => parseCursor("not base64url!!! ###")).toThrow();
  });

  test("throws when source is neither 'claim' nor 'request'", () => {
    const wrongShape = Buffer.from(
      JSON.stringify({ t: "2026-09-10T12:00:00.000Z", s: "other", i: "x" }),
      "utf8",
    ).toString("base64url");
    expect(() => parseCursor(wrongShape)).toThrow();
  });
});
