import { expect, test } from "@playwright/test";

import { cursorFor, parseCursor } from "@/lib/data/admin-teams-server";

/**
 * The Admin › Teams keyset cursor (T10) — pure, no I/O.
 *
 * `cursorFor`/`parseCursor` round-trip a `(school_name, id)` pair through an
 * opaque base64url token. The interesting cases are the ones a naive
 * delimited string would get wrong: a school name carrying the delimiter
 * itself ("University of California, Los Angeles" is a real row), unicode,
 * and a cursor nobody produced (hand-edited or corrupted), which must throw
 * rather than silently restart the listing at page one.
 */

test.describe("cursorFor / parseCursor round-trip", () => {
  test("round-trips a plain school name", () => {
    const cursor = cursorFor({
      schoolName: "Dartmouth College",
      id: "abc-123",
    });
    expect(parseCursor(cursor)).toEqual({
      schoolName: "Dartmouth College",
      id: "abc-123",
    });
  });

  test("round-trips a school name containing a comma", () => {
    const key = {
      schoolName: "University of California, Los Angeles",
      id: "a8e46b09-6a82-4700-bdc9-078ad45dc609",
    };
    expect(parseCursor(cursorFor(key))).toEqual(key);
  });

  test("round-trips unicode in the school name", () => {
    const key = { schoolName: "Université de Montréal", id: "id-1" };
    expect(parseCursor(cursorFor(key))).toEqual(key);
  });

  test("round-trips an empty school name", () => {
    const key = { schoolName: "", id: "id-1" };
    expect(parseCursor(cursorFor(key))).toEqual(key);
  });

  test("produces a URL-safe token (no + / = characters)", () => {
    // base64url, not base64 — this token rides in a query string.
    const cursor = cursorFor({
      schoolName: "A School With ??? Odd >>> Characters",
      id: "id-1",
    });
    expect(cursor).not.toMatch(/[+/=]/);
  });
});

test.describe("parseCursor on a cursor nobody produced", () => {
  test("throws on a string that is not base64url", () => {
    expect(() => parseCursor("not base64url!!! ###")).toThrow();
  });

  test("throws on base64url that does not decode to JSON", () => {
    const notJson = Buffer.from("plainly not json", "utf8").toString(
      "base64url",
    );
    expect(() => parseCursor(notJson)).toThrow();
  });

  test("throws on well-formed JSON missing the expected fields", () => {
    const wrongShape = Buffer.from(
      JSON.stringify({ foo: "bar" }),
      "utf8",
    ).toString("base64url");
    expect(() => parseCursor(wrongShape)).toThrow();
  });

  test("throws when id is present but not a string", () => {
    const wrongType = Buffer.from(
      JSON.stringify({ s: "Dartmouth College", i: 123 }),
      "utf8",
    ).toString("base64url");
    expect(() => parseCursor(wrongType)).toThrow();
  });
});
