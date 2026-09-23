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

/**
 * T5 — "Start over with a different player?" (`StartOverDialog.tsx`), opened
 * by the bar's button on the trim and details steps of a video upload.
 *
 * Radix portals the dialog, which renders nothing on the server, so the copy
 * is checked through `startOverCopy()` — the one place the component reads
 * its words from, body paragraphs included. Copy is author-approved; these
 * pin it verbatim.
 */
const { startOverCopy } = loader.load(
  "src/components/dashboard/matches/new-match-wizard/StartOverDialog.tsx",
) as {
  startOverCopy: (input: {
    step: "trim" | "match";
    subjectName: string;
    firstName: string | null;
  }) => Record<string, string>;
};

test.describe("StartOverDialog copy", () => {
  test("the trim step: the video check is redone", () => {
    const copy = startOverCopy({
      step: "trim",
      subjectName: "Marcus Reid",
      firstName: "Marcus",
    });
    expect(copy.title).toBe("Start over with a different player?");
    expect(copy.description).toBe(
      "The video check was set up for Marcus Reid, so you'll pick the player again and redo it.",
    );
    expect(`Kept: ${copy.kept}.`).toBe("Kept: your video file.");
    expect(`Cleared: ${copy.cleared}`).toBe(
      "Cleared: the trim window and both camera answers.",
    );
    expect(copy.confirmLabel).toBe("Start over");
    expect(copy.cancelLabel).toBe("Keep Marcus");
  });

  test("the details step: the score and players go too", () => {
    const copy = startOverCopy({
      step: "match",
      subjectName: "Marcus Reid",
      firstName: "Marcus",
    });
    expect(copy.title).toBe("Start over with a different player?");
    expect(copy.description).toBe(
      "The video check and this score were set up for Marcus Reid, so you'll go through each step again from step 1.",
    );
    expect(`Kept: ${copy.kept}.`).toBe("Kept: your video file.");
    expect(`Cleared: ${copy.cleared}`).toBe(
      "Cleared: the trim window, both camera answers, this score and the players.",
    );
    expect(copy.confirmLabel).toBe("Start over");
    expect(copy.cancelLabel).toBe("Keep Marcus");
  });

  test("the viewer's own profile still keeps by first name", () => {
    const copy = startOverCopy({
      step: "trim",
      subjectName: "Casey Lin",
      firstName: "Casey",
    });
    expect(copy.cancelLabel).toBe("Keep Casey");
  });
});
