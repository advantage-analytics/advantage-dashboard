import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

/**
 * "Add to an event" inside the upload wizard: the match isn't saved yet and
 * the picked video lives in this tab, so an empty search points to Edit match
 * later instead of "make the event first", and the schedule links open in a
 * new tab. Edit Match keeps its own wording and same-tab links.
 */
const read = (path: string) =>
  readFileSync(resolve(__dirname, "..", path), "utf8");
const picker = read(
  "src/components/dashboard/matches/match-actions/attach-line-picker.tsx",
);
const details = read(
  "src/components/dashboard/matches/new-match-wizard/DetailsStepContent.tsx",
);

test("the wizard's picker is marked unsaved", () => {
  const picked = details.slice(
    details.indexOf("<AttachLinePicker<UploadLine>"),
  );
  expect(picked.slice(0, 900)).toMatch(/\n\s+unsaved\n/);
});

test("an unsaved match is told it can be added from Edit match later", () => {
  expect(picker).toContain(
    "Search another day, or save this as a one-off. Once the event is on the schedule, add the match to it from Edit match.",
  );
  expect(picker).toContain(
    "Save it as a one-off for now and add it from Edit match later.",
  );
  expect(picker).toContain(
    "Not on the schedule yet? Add it later from Edit match.",
  );
  // Edit Match's own wording stays.
  expect(picker).toContain(
    "Search for an event on another day, or add the dual to the schedule first.",
  );
});

test("the schedule links open in a new tab only for an unsaved match", () => {
  expect(picker).toContain(
    '? ({ target: "_blank", rel: "noopener noreferrer" } as const)',
  );
  expect(picker.match(/\{\.\.\.scheduleLinkProps\}/g)?.length).toBe(2);
});

test("someone who can't edit the schedule hears it can be added later", () => {
  expect(details).toContain(
    "One-off for now. A coach who runs the schedule can add it to an event",
  );
});
