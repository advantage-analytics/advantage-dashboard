import { expect, test } from "@playwright/test";

import {
  HINT_ANCHOR,
  HINT_SIDE,
  activityHintDue,
  hintCopy,
  workspaceHintDue,
} from "@/lib/onboarding/hints";

/**
 * The shell's one-card hints' pure rules: where each points, which side it
 * opens on, its exact copy, and the two "is it due" predicates — each branch
 * flipped to false on its own.
 */

test.describe("HINT_ANCHOR / HINT_SIDE", () => {
  test("each hint anchors to its own data-tour value", () => {
    expect(HINT_ANCHOR).toEqual({
      "workspace-switcher": "workspace-switcher",
      "activity-tray": "activity-tray",
    });
  });

  test("the sidebar switcher opens right; the header tray opens below", () => {
    expect(HINT_SIDE).toEqual({
      "workspace-switcher": "right",
      "activity-tray": "bottom",
    });
  });
});

test.describe("hintCopy", () => {
  test("the switcher hint names the team the viewer is now in", () => {
    expect(
      hintCopy("workspace-switcher", { teamName: "Stanford Women's Tennis" }),
    ).toEqual({
      title: "You're in Stanford Women's Tennis now.",
      body: "Switch back to your own matches here.",
    });
  });

  test("the tray hint says the upload keeps going", () => {
    expect(hintCopy("activity-tray", {})).toEqual({
      title: "Your upload keeps going.",
      body: "Track it here.",
    });
  });
});

test.describe("workspaceHintDue", () => {
  const due = {
    activeKind: "team",
    workspaceCount: 2,
    doneAt: null,
  } as const;

  test("a team workspace with somewhere to switch back to, not done: due", () => {
    expect(workspaceHintDue(due)).toBe(true);
  });

  test("a personal workspace is not due", () => {
    expect(workspaceHintDue({ ...due, activeKind: "personal" })).toBe(false);
  });

  test("a single workspace has nowhere to switch to", () => {
    expect(workspaceHintDue({ ...due, workspaceCount: 1 })).toBe(false);
    expect(workspaceHintDue({ ...due, workspaceCount: 0 })).toBe(false);
  });

  test("a hint already done is not due", () => {
    expect(workspaceHintDue({ ...due, doneAt: "2026-10-01T00:00:00Z" })).toBe(
      false,
    );
  });
});

test.describe("activityHintDue", () => {
  const due = {
    inFlightCount: 1,
    onWizard: false,
    armed: true,
    doneAt: null,
  } as const;

  test("an upload in flight, armed, off the wizard, not done: due", () => {
    expect(activityHintDue(due)).toBe(true);
  });

  test("a hint already done is not due", () => {
    expect(activityHintDue({ ...due, doneAt: "2026-10-01T00:00:00Z" })).toBe(
      false,
    );
  });

  test("not armed this session is not due", () => {
    expect(activityHintDue({ ...due, armed: false })).toBe(false);
  });

  test("still on the wizard is not due", () => {
    expect(activityHintDue({ ...due, onWizard: true })).toBe(false);
  });

  test("nothing in flight is not due", () => {
    expect(activityHintDue({ ...due, inFlightCount: 0 })).toBe(false);
  });
});
