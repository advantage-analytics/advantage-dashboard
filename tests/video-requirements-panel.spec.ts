import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createLoader, marker } from "./fixtures/vm-modules";

/**
 * The file step's "Before you add a video" block — the three lead rows, the
 * PlaySight/CIZR note, the line of facts under the drop zone, and the frame
 * diagram.
 *
 * Rendered offline through `fixtures/vm-modules`. The dialog is stubbed: it is
 * closed on first render and draws nothing, and its Radix shell is not what
 * this spec is about.
 */

const DIR = "src/components/dashboard/matches/new-match-wizard";

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

type Result = {
  status: "pass" | "warn";
  label: string;
  suggestion?: string;
};

function loadPanel() {
  const loader = createLoader({
    stubs: {
      "./VideoRequirementsDialog": {
        VideoRequirementsDialog: marker("VideoRequirementsDialog"),
      },
    },
  });
  return loader.load(`${DIR}/VideoRequirements.tsx`) as {
    VideoRequirements: React.ComponentType<{ result?: Result }>;
    VideoRequirementsFacts: React.ComponentType;
  };
}

function renderPanel(result?: Result): string {
  const { VideoRequirements } = loadPanel();
  return renderToStaticMarkup(
    React.createElement(VideoRequirements, { result }),
  );
}

function renderFacts(): string {
  const { VideoRequirementsFacts } = loadPanel();
  return renderToStaticMarkup(React.createElement(VideoRequirementsFacts));
}

function renderFrame(variant: "works" | "wont-work"): string {
  const { CourtFrame } = createLoader().load(`${DIR}/CourtFrame.tsx`) as {
    CourtFrame: React.ComponentType<{ variant: "works" | "wont-work" }>;
  };
  return renderToStaticMarkup(React.createElement(CourtFrame, { variant }));
}

test("leads with the full match, then resolution and frame rate, then the camera's view", () => {
  const out = text(renderPanel());
  const order = [
    "The full match, unedited",
    "1080p at 30 fps or higher",
    "Filmed from behind the baseline",
  ].map((row) => out.indexOf(row));
  expect(order.every((i) => i >= 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  expect(out).toContain("Not a highlight or cut version");
});

test("says where to get the original from PlaySight and CIZR, closed by default", () => {
  const html = renderPanel();
  const out = text(html);
  expect(out).toContain("Using PlaySight or CIZR?");
  expect(out).toContain("download the original file, not the stream");
  expect(out).toContain("download the full match, not the edited version");
  // A native disclosure, shut until asked: the block holds no state.
  expect(html).toMatch(/<details(?![^>]*\bopen\b)[^>]*>/);
});

test("keeps the rest as one line of facts above the dialog link", () => {
  const html = renderFacts();
  expect(text(html)).toContain(
    "One camera that doesn't move · Singles · Complete games · Under 8 GB",
  );
  expect(html).toContain('data-component="VideoRequirementsDialog"');
  // The dialog lives in the facts, not in the block above the drop zone.
  expect(renderPanel()).not.toContain("VideoRequirementsDialog");
});

test("the file step reads the requirements before the picker and the facts after", () => {
  // Source order, like upload-details-video-section.spec.ts: a static render
  // of the whole step costs more than the wiring it would show. The block
  // above the drop zone is the point of this change — guidance read after
  // the file is chosen is guidance read too late.
  const src = readFileSync(`${DIR}/FileStepContent.tsx`, "utf8");
  const requirements = src.indexOf("<VideoRequirements result=");
  const dropZone = src.indexOf('controlName("wizard_choose_file")');
  const facts = src.indexOf("<VideoRequirementsFacts />");
  expect(requirements).toBeGreaterThan(-1);
  expect(dropZone).toBeGreaterThan(requirements);
  expect(facts).toBeGreaterThan(dropZone);
  // Drawn once: it stays over a checked file rather than moving under it.
  expect(src.split("<VideoRequirements result=").length - 1).toBe(1);
});

test("the panel stays server-renderable", () => {
  // The dialog is the client boundary; a directive here would move it.
  const source = readFileSync(`${DIR}/VideoRequirements.tsx`, "utf8");
  expect(source).not.toMatch(/^\s*["']use client["']/m);
});

test("the frame that works marks the service line and outlines the area", () => {
  const html = renderFrame("works");
  // The area behind the near baseline is a dashed outline, never a tint.
  const dashed = html.match(/<polygon[^>]*stroke-dasharray[^>]*>/)?.[0] ?? "";
  expect(dashed).toContain('fill="none"');
  expect(dashed).toContain("var(--blue)");
  // The far service line is a filled court line, not a stroke over the court.
  expect(html).toContain('fill="var(--blue)"');
});

test("the frame that does not work carries no blue marks", () => {
  expect(renderFrame("wont-work")).not.toContain("var(--blue)");
});

test("row 2 states the rule until a video has been checked", () => {
  const out = text(renderPanel());
  expect(out).toContain("Checked when you add the file · 60 fps is better");
  expect(out).not.toContain("This video meets it");
});

test("a video that passes turns row 2 into the answer", () => {
  const html = renderPanel({ status: "pass", label: "1080p · 30 fps" });
  const out = text(html);
  expect(out).toContain("This video meets it");
  expect(out).toContain("1080p · 30 fps");
  expect(html).not.toContain("var(--warning-text)");
});

test("a video accepted with a caution reads as one, in the warning ink", () => {
  const html = renderPanel({ status: "warn", label: "1080p · 29.95 fps" });
  const out = text(html);
  // The block sits above the picker, so the caution strip is below it.
  expect(out).toContain("Accepted · See the note below");
  expect(out).not.toContain("note above");
  expect(out).toContain("1080p · 29.95 fps");
  expect(html).toContain("var(--warning-text)");
});

test("a passing video's suggestion joins row 2 instead of taking a strip", () => {
  const out = text(
    renderPanel({
      status: "pass",
      label: "1080p · 30 fps",
      suggestion: "60 fps gives more accurate stats",
    }),
  );
  expect(out).toContain(
    "This video meets it · 60 fps gives more accurate stats",
  );
});
