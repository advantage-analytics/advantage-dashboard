import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * `/admin/labels/[sessionId]`: the admin's way to the match's report, and the
 * way back. Read off the page's source, since the page is an async Server
 * Component the offline harness does not render.
 */

const source = readFileSync(
  "src/app/admin/labels/[sessionId]/page.tsx",
  "utf8",
);

test("the header links the session's own match report", () => {
  expect(source).toContain(
    "href={`/admin/matches/${encodeURIComponent(session.matchId)}`}",
  );
  expect(source).toMatch(/>\s*Match report\s*</);
});

test("the way back is a top-left Labels link, not a header action", () => {
  expect(source).not.toContain("Back to Labels");
  const back = source.indexOf('href="/admin/labels"');
  const consoleAt = source.indexOf("<LabelConsole");
  expect(back).toBeGreaterThan(-1);
  // Drawn before the console, so it sits above the header.
  expect(back).toBeLessThan(consoleAt);
});
