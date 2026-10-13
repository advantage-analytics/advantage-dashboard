import { expect, test } from "@playwright/test";

import {
  parseSubs,
  subArgs,
  substitute,
  substituteQuestion,
} from "../scripts/lib/ask-eval-subs";

/**
 * `scripts/lib/ask-eval-subs.ts` — the `--sub "Placeholder=Real Name"` flag of
 * `scripts/ask-eval.ts`. The question lists in the repo name players and
 * opponents that exist in no program; without a substitution a straight run
 * of `ask-eval-team.json` reports TAG REFUSED for every tagged question.
 * Offline: no model, no database.
 */

const SUBS = parseSubs(["Sokolov=Rudy Quan", "Reyes=Emon van Loben Sels"]);

test.describe("--sub", () => {
  test("is repeatable, and takes either spelling of a flag's value", () => {
    expect(
      subArgs([
        "node",
        "ask-eval.ts",
        "--out",
        "report.md",
        "--sub",
        "Sokolov=Rudy Quan",
        "--program",
        "abc",
        "--sub=Reyes=Emon van Loben Sels",
      ]),
    ).toEqual(["Sokolov=Rudy Quan", "Reyes=Emon van Loben Sels"]);
    expect(subArgs(["node", "ask-eval.ts", "--out", "report.md"])).toEqual([]);
    // Nothing after the flag is reported by the parser, not dropped here.
    expect(subArgs(["--sub"])).toEqual([""]);
  });

  test("splits at the first =, trimmed", () => {
    expect([...SUBS]).toEqual([
      ["Sokolov", "Rudy Quan"],
      ["Reyes", "Emon van Loben Sels"],
    ]);
    expect([...parseSubs([" Okafor = A=B "])]).toEqual([["Okafor", "A=B"]]);
  });

  test("refuses one that is not Placeholder=Real Name", () => {
    for (const bad of ["Sokolov", "=Rudy Quan", "Sokolov=", "", " = "]) {
      expect(() => parseSubs([bad])).toThrow(/Placeholder=Real Name/);
    }
    expect(() => parseSubs(["Reyes=A", "Reyes=B"])).toThrow(/twice/);
    // The same pair twice is only a repeat.
    expect(parseSubs(["Reyes=A", "Reyes=A"]).size).toBe(1);
  });
});

test.describe("substitute", () => {
  test("whole words, possessives included, case-sensitive", () => {
    expect(substitute("How did Sokolov do against Reyes?", SUBS)).toBe(
      "How did Rudy Quan do against Emon van Loben Sels?",
    );
    expect(substitute("Reyes's figures beside the team's", SUBS)).toBe(
      "Emon van Loben Sels's figures beside the team's",
    );
    // Not inside another word, and not in another case.
    expect(substitute("Reyeson and reyes and McSokolov", SUBS)).toBe(
      "Reyeson and reyes and McSokolov",
    );
  });

  test("one pass: a name that contains a placeholder is not substituted again", () => {
    const subs = parseSubs(["Sokolov=Reyes", "Reyes=Sokolov"]);
    expect(substitute("Sokolov beat Reyes", subs)).toBe("Reyes beat Sokolov");
  });

  test("the longer placeholder wins, and a name's own characters are literal", () => {
    const subs = parseSubs(["Reyes=A", "Van Reyes=B", "O.K=C", "Lee=$& $1"]);
    expect(substitute("Van Reyes, then Reyes", subs)).toBe("B, then A");
    expect(substitute("O.K and OxK", subs)).toBe("C and OxK");
    expect(substitute("Lee", subs)).toBe("$& $1");
  });

  test("no substitutions, no change", () => {
    expect(substitute("How did Sokolov do?", new Map())).toBe(
      "How did Sokolov do?",
    );
  });
});

test.describe("substituteQuestion", () => {
  test("the text, every tagged name and the note; the rest passed through", () => {
    const question = {
      q: "How did Sokolov do against Lindqvist?",
      players: ["Sokolov"],
      opponents: ["Lindqvist"],
      matches: ["Reyes"],
      after: 3,
      want: "keeps Sokolov: never another player's",
    };
    const before = structuredClone(question);

    expect(substituteQuestion(question, SUBS)).toEqual({
      q: "How did Rudy Quan do against Lindqvist?",
      players: ["Rudy Quan"],
      opponents: ["Lindqvist"],
      matches: ["Emon van Loben Sels"],
      after: 3,
      want: "keeps Rudy Quan: never another player's",
    });
    // The list read from the file is not changed.
    expect(question).toEqual(before);
  });

  test("a question with no tags gains none", () => {
    expect(
      substituteQuestion({ q: "And how about his return?", after: 23 }, SUBS),
    ).toEqual({ q: "And how about his return?", after: 23 });
  });

  test("the committed team list keeps its placeholders, and they are all replaceable", async () => {
    const { readFileSync } = await import("node:fs");
    const list = JSON.parse(
      readFileSync("scripts/ask-eval-team.json", "utf8"),
    ) as { q: string; players?: string[]; opponents?: string[] }[];
    const tagged = new Set(list.flatMap((entry) => entry.players ?? []));
    // Placeholders only: the repo carries no roster.
    expect([...tagged].sort()).toEqual(["Reyes", "Sokolov"]);

    const run = list.map((entry) => substituteQuestion(entry, SUBS));
    for (const entry of run) {
      for (const name of entry.players ?? []) {
        expect(["Rudy Quan", "Emon van Loben Sels"]).toContain(name);
      }
      expect(entry.q).not.toMatch(/\b(Sokolov|Reyes)\b/);
    }
  });
});
