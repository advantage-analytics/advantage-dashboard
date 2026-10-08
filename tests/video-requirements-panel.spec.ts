import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createLoader, marker } from "./fixtures/vm-modules";

/**
 * The file step's "What the analysis needs" block — the two lead rows, the
 * line of facts, and the frame diagram.
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

type Result = { status: "pass" | "warn"; label: string };

function renderPanel(result?: Result): string {
  const loader = createLoader({
    stubs: {
      "./VideoRequirementsDialog": {
        VideoRequirementsDialog: marker("VideoRequirementsDialog"),
      },
    },
  });
  const { VideoRequirements } = loader.load(`${DIR}/VideoRequirements.tsx`) as {
    VideoRequirements: React.ComponentType<{ result?: Result }>;
  };
  return renderToStaticMarkup(
    React.createElement(VideoRequirements, { result }),
  );
}

function renderFrame(variant: "works" | "wont-work"): string {
  const { CourtFrame } = createLoader().load(`${DIR}/CourtFrame.tsx`) as {
    CourtFrame: React.ComponentType<{ variant: "works" | "wont-work" }>;
  };
  return renderToStaticMarkup(React.createElement(CourtFrame, { variant }));
}

test("leads with resolution and frame rate, then the camera's view", () => {
  const out = text(renderPanel());
  expect(out).toContain("1080p at 30 fps or higher");
  expect(out).toContain("Camera behind the back fence");
  expect(out.indexOf("1080p at 30 fps")).toBeLessThan(
    out.indexOf("Camera behind the back fence"),
  );
});

test("keeps the rest as one line of facts above the dialog link", () => {
  const html = renderPanel();
  expect(text(html)).toContain(
    "Uncut, with the time between points · One camera that doesn't move · Singles · Complete games · Under 8 GB",
  );
  expect(html).toContain('data-component="VideoRequirementsDialog"');
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

test("row 1 states the rule until a video has been checked", () => {
  const out = text(renderPanel());
  expect(out).toContain("Checked when you add the file · 60 fps is better");
  expect(out).not.toContain("This video meets it");
});

test("a video that passes turns row 1 into the answer", () => {
  const html = renderPanel({ status: "pass", label: "1080p · 30 fps" });
  const out = text(html);
  expect(out).toContain("This video meets it");
  expect(out).toContain("1080p · 30 fps");
  expect(html).not.toContain("var(--warning-text)");
});

test("a video accepted with a caution reads as one, in the warning ink", () => {
  const html = renderPanel({ status: "warn", label: "1080p · 29.95 fps" });
  const out = text(html);
  expect(out).toContain("Accepted · See the note above");
  expect(out).toContain("1080p · 29.95 fps");
  expect(html).toContain("var(--warning-text)");
});
