import { expect, test } from "@playwright/test";

import {
  ASK_COACH_MODE_ENV,
  ASK_COACH_ROLES,
  ASK_COACH_SENTENCE,
  askCoachMode,
  isAskCoachModeEnabled,
} from "@/lib/services/ask/coach";
import { PERSONAL_ASK_SCOPE, type AskScope } from "@/lib/services/ask/scope";
import { withEnv } from "./fixtures/with-env";

/**
 * Pure-logic spec for coach mode's gate (roadmap 4.3,
 * `src/lib/services/ask/coach.ts`): the flag, the scope and the role, all
 * three. The route's use of it is pinned in `ask-route.spec.ts`, the prompt
 * variant in `ask-prompt.spec.ts`.
 */

const TEAM: AskScope = {
  kind: "team",
  programId: "eeeeeeee-0000-4000-8000-000000000005",
  programName: "Westbrook College",
};

test("the flag is off unless it says 1, true or on", async () => {
  expect(ASK_COACH_MODE_ENV).toBe("ASK_COACH_MODE");
  for (const value of [undefined, "", "0", "false", "off", "yes", "coach"]) {
    await withEnv(
      [ASK_COACH_MODE_ENV],
      { [ASK_COACH_MODE_ENV]: value },
      async () => {
        expect(isAskCoachModeEnabled()).toBe(false);
      },
    );
  }
  for (const value of ["1", "true", "TRUE", " on ", "On"]) {
    await withEnv(
      [ASK_COACH_MODE_ENV],
      { [ASK_COACH_MODE_ENV]: value },
      async () => {
        expect(isAskCoachModeEnabled()).toBe(true);
      },
    );
  }
  expect(isAskCoachModeEnabled({})).toBe(false);
  expect(isAskCoachModeEnabled({ ASK_COACH_MODE: "1" })).toBe(true);
});

test("coach mode needs the flag, a team scope and an owner or coach", () => {
  expect([...ASK_COACH_ROLES]).toEqual(["owner", "coach"]);
  for (const role of ["owner", "coach"] as const) {
    expect(askCoachMode({ enabled: true, scope: TEAM, role })).toBe(true);
    // The flag off: nothing, whatever the role.
    expect(askCoachMode({ enabled: false, scope: TEAM, role })).toBe(false);
    // A personal question: nothing, whatever the role says.
    expect(
      askCoachMode({ enabled: true, scope: PERSONAL_ASK_SCOPE, role }),
    ).toBe(false);
  }
  for (const role of ["player", "staff", null, undefined] as const) {
    expect(askCoachMode({ enabled: true, scope: TEAM, role })).toBe(false);
  }
});

test("the coach sentence is the server's: one sentence, no digits, about the cited figures", () => {
  expect(ASK_COACH_SENTENCE).toBe(
    "Coach mode: what to work on is drawn from the cited figures of the program's matches.",
  );
  expect(ASK_COACH_SENTENCE).not.toMatch(/\d/);
});
