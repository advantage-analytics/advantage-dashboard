import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createLoader } from "./fixtures/vm-modules";

/**
 * T4 — the subject bar on steps 2–4 of a non-preset team upload
 * (`SubjectBar.tsx`, in `WizardShell`'s pinned slot).
 *
 * `SubjectBar` renders FOR REAL through `createLoader()`: it reads the chosen
 * subject and the workspace and writes "For <name> | <workspace> · Not
 * <first>?". No server, no database.
 */

const loader = createLoader();
const { SubjectBar } = loader.load(
  "src/components/dashboard/matches/new-match-wizard/SubjectBar.tsx",
) as { SubjectBar: React.ComponentType<Record<string, unknown>> };

const workspace = {
  kind: "team",
  id: "program-1",
  name: "Cardinal",
  team: "mens",
  role: "coach",
  myPlayerId: "player-self",
};

function render(subject: unknown, ws: Record<string, unknown> = workspace) {
  return renderToStaticMarkup(
    React.createElement(SubjectBar, {
      subject,
      workspace: ws,
      onNotSubject: () => {},
    }),
  );
}

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

test.describe("SubjectBar", () => {
  test("a roster subject reads For <name>, the workspace, and Not <first>?", () => {
    const out = text(
      render({ kind: "roster", playerId: "player-9", name: "Marcus Reid" }),
    );
    expect(out).toContain("For");
    expect(out).toContain("Marcus Reid");
    expect(out).toContain("Cardinal · M");
    expect(out).toContain("Not Marcus?");
    expect(out).not.toContain("Not you?");
  });

  test("the viewer's own profile reads Not you?", () => {
    const out = text(
      render({ kind: "roster", playerId: "player-self", name: "Casey Lin" }),
    );
    expect(out).toContain("Casey Lin");
    expect(out).toContain("Not you?");
    expect(out).not.toContain("Not Casey?");
  });

  test("renders nothing without a chosen subject", () => {
    expect(render(null)).toBe("");
  });
});
