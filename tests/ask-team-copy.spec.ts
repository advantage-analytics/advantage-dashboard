import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

import {
  PERSONAL_ASK_COPY,
  askCopy,
  askDayZeroCopy,
  type AskCopy,
} from "@/components/dashboard/ask/ask-copy";
import {
  PERSONAL_ASK_SCOPE,
  askBasePath,
  type AskScope,
} from "@/lib/services/ask/scope";

/**
 * The Ask page's words by scope (`ask-copy.ts`), and the two route files
 * that choose the scope. Offline.
 *
 * The team page is the personal page's shell with a different scope, so what
 * goes wrong goes wrong quietly: a coach reads "Reading your matches" over a
 * roster's season, a link in the team rail opens the personal page, or a
 * player who cannot upload is offered a button that refuses.
 */

const TEAM: AskScope = {
  kind: "team",
  programId: "program-1",
  programName: "Westbrook",
};

/** Every sentence a copy object can put on screen. */
function sentences(copy: AskCopy): string[] {
  return [
    copy.lead,
    copy.placeholder,
    copy.tagMenuLabel,
    copy.tagNoMatch("zzz"),
    copy.tagEmpty,
    copy.trendAverage,
    copy.noAdvice,
    ...Object.values(copy.stage),
    ...Object.values(copy.errors).flatMap((error) => [
      error.title,
      error.detail,
    ]),
  ];
}

test("the personal page's copy is what it was", () => {
  const copy = askCopy(PERSONAL_ASK_SCOPE);
  expect(copy).toBe(PERSONAL_ASK_COPY);
  expect(copy.lead).toBe("Answers are computed from your own matches.");
  expect(copy.stage.querying).toBe("Reading your matches");
  expect(copy.trendAverage).toBe("Your average");
  expect(copy.tagMenuLabel).toBe("Tag a match or opponent");
});

test("the team page names its program and never says the matches are the asker's", () => {
  const copy = askCopy(TEAM);
  expect(copy.lead).toBe("Answers are computed from Westbrook's matches.");
  for (const sentence of sentences(copy)) {
    // "Your question is kept." is the asker's own and stays; the matches are
    // not theirs.
    expect(sentence, sentence).not.toMatch(/your (own )?(match|average)/i);
  }
  expect(copy.placeholder).toMatch(/a player/);
  expect(copy.tagMenuLabel).toBe("Tag a player, match or opponent");
});

test("both scopes answer every stage and every error code", () => {
  const personal = askCopy(PERSONAL_ASK_SCOPE);
  const team = askCopy(TEAM);
  expect(Object.keys(team.stage)).toEqual(Object.keys(personal.stage));
  expect(Object.keys(team.errors).sort()).toEqual(
    Object.keys(personal.errors).sort(),
  );
  for (const sentence of [...sentences(personal), ...sentences(team)]) {
    expect(sentence.trim()).not.toBe("");
    // The design system's rule: no lower-case word after a middot.
    expect(sentence).not.toMatch(/· [a-z]/);
  }
});

test.describe("day zero", () => {
  test("personal: the offer's own sentence and conditions", () => {
    expect(askDayZeroCopy(PERSONAL_ASK_SCOPE, false)).toEqual({
      headline: "Send a match, then ask anything about it.",
      conditions: undefined,
    });
    // `canUpload` is a fact about a program; it changes nothing here.
    expect(askDayZeroCopy(PERSONAL_ASK_SCOPE, true)).toEqual(
      askDayZeroCopy(PERSONAL_ASK_SCOPE, false),
    );
  });

  test("team, may upload: asked to send one, under the offer's own conditions", () => {
    const copy = askDayZeroCopy(TEAM, true);
    expect(copy.headline).toBe(
      "Send a match for the program, then ask anything about it.",
    );
    expect(copy.conditions).toBeUndefined();
  });

  test("team, may not upload: not asked to send anything, and told who does", () => {
    const copy = askDayZeroCopy(TEAM, false);
    expect(copy.headline).not.toMatch(/^Send/);
    expect(copy.conditions).toMatch(/coaching staff/);
  });
});

test.describe("the routes", () => {
  const read = (file: string) => readFileSync(file, "utf8");

  test("each scope has its own page, and the team page is built", () => {
    expect(askBasePath(PERSONAL_ASK_SCOPE)).toBe("/dashboard/ask");
    expect(askBasePath(TEAM)).toBe("/dashboard/team/ask");

    const team = read("src/app/dashboard/team/ask/page.tsx");
    expect(team).not.toContain("ComingSoonPage");
    expect(team).toContain("<AskPage");
    // The states the page must have: an error boundary here, a loading
    // fallback beside it, and the empty state inside `AskPage`.
    expect(team).toContain("<WidgetBoundary");
    expect(read("src/app/dashboard/team/ask/loading.tsx")).toContain(
      "@/app/dashboard/ask/loading",
    );
  });

  test("the team page takes its program from the active workspace and hands it to every scoped loader", () => {
    const team = read("src/app/dashboard/team/ask/page.tsx");
    expect(team).toContain("getWorkspaceContext()");
    expect(team).toContain("getAskTagOptions(programId)");
    expect(team).toContain("getAskConversations(programId)");
    expect(team).toContain("getAskConversation(conversationId, programId)");
    // The limit is the asker's own: no program.
    expect(team).toContain("getAskQuota()");
    // The button is offered by the rule the upload route itself asks —
    // role, policy AND a program approved to send video — never by the role
    // half alone, which offers it to a program still in review.
    expect(team).toContain("canUpload={explainVideoRefusal(active) === null}");
    expect(team).not.toContain("canUpload={canUploadForProgram");
    // The rail's dates are read in the program's zone.
    expect(team).toContain("timeZone={active.timeZone}");
    // Never from the address bar.
    expect(team).not.toMatch(/searchParams[^;]*program/i);
  });

  test("the personal page stays personal", () => {
    const personal = read("src/app/dashboard/ask/page.tsx");
    expect(personal).toContain("scope={PERSONAL_ASK_SCOPE}");
    expect(personal).toContain("getAskTagOptions()");
    expect(personal).toContain("getAskConversations()");
    // The workspace is read for its time zone — what the rail dates earlier
    // questions in — and for nothing that decides whose matches are asked
    // about: no loader takes anything from it.
    expect(personal).toContain("timeZone={workspace?.active.timeZone}");
    expect(personal.match(/\bworkspace\b\??\./g)).toEqual(["workspace?."]);
    expect(personal).not.toMatch(/getAsk\w+\([^)]*(workspace|program)/);
  });

  test("the shell and the delete action hard-code neither page", () => {
    // Code only: the doc comments name both pages, as they should.
    const code = (file: string) =>
      read(file)
        .split("\n")
        .filter((line) => !/^\s*(\*|\/\*|\/\/)/.test(line))
        .join("\n");
    const shell = code("src/components/dashboard/ask/ask-page.tsx");
    const rail = code("src/components/dashboard/ask/ask-rail.tsx");
    // Every URL the shell or the rail writes comes from `askBasePath(scope)`.
    expect(shell).not.toMatch(/["'`]\/dashboard\/(team\/)?ask/);
    expect(rail).not.toMatch(/["'`]\/dashboard\/(team\/)?ask/);
    expect(shell).toContain("askBasePath(scope)");
    expect(rail).toContain("askBasePath(scope)");
    expect(shell).toContain("deleteAskConversation(id, scope.kind)");

    // Every action revalidates one of two literals — through `askPath()`,
    // which picks between them — or Home's own literal, never its argument.
    const actions = read("src/app/dashboard/ask/actions.ts");
    expect(actions).toContain(
      'return scopeKind === "team" ? ASK_PATH.team : ASK_PATH.personal;',
    );
    expect(actions).toContain('const HOME_PATH = "/dashboard";');
    // One nesting level, so `askPath(scopeKind)` is read whole.
    const calls =
      actions.match(/revalidatePath\((?:[^()]|\([^()]*\))*\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect([
        "revalidatePath(askPath(scopeKind))",
        "revalidatePath(HOME_PATH)",
      ]).toContain(call);
    }
  });
});
