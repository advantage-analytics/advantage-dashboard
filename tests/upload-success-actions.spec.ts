import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

/**
 * The screen after "Save match" — `UploadMatchSuccess`. Source-level: the
 * component needs a live upload to render its states, and what these pin is
 * which copy and which exit each state carries.
 */
const src = readFileSync(
  resolve(
    __dirname,
    "../src/components/dashboard/matches/new-match-wizard/UploadMatchSuccess.tsx",
  ),
  "utf8",
);

test("mid-upload, the instruction leads and the reassurance sits under it", () => {
  // The strings live in `upload-progress-copy.ts` (shared with the match
  // page's progress panel); the order they render in is this file's.
  const keep = src.indexOf("UPLOADING_COPY.notes.keepTabOpen");
  const reassure = src.indexOf("UPLOADING_COPY.notes.keepUsing");
  expect(keep).toBeGreaterThan(-1);
  expect(reassure).toBeGreaterThan(keep);
});

test("Back to matches shows only once nothing in this tab is running, and never beside Back to the event", () => {
  expect(src).toContain('const MATCHES_HREF = "/dashboard/matches";');
  const exits = src.slice(
    src.indexOf("{backToEvent ? ("),
    src.indexOf("Back to matches"),
  );
  expect(exits).toContain("Back to the event");
  expect(exits).toContain("!view.busy &&");
  expect(exits).toContain("href={MATCHES_HREF}");
});

test("Cancel asks first, in a danger ConfirmDialog, and only confirm cancels", () => {
  expect(src).toContain("<CancelUploadControl cancel={upload.cancel} />");
  const dlg = src.slice(src.indexOf("function CancelUploadControl"));
  expect(dlg).toContain("<ConfirmDialog");
  expect(dlg).toContain('tone="danger"');
  expect(dlg).toContain('title="Cancel this upload?"');
  expect(dlg).toContain("The match stays saved with its score.");
  expect(dlg).toContain(
    "Only the video stops, and you can add it again later from the match page.",
  );
  // Closes with the control when the upload ends.
  expect(src).toContain("{upload?.cancel && <CancelUploadControl");
  expect(dlg).toContain("<ConfirmNote icon={<Clock />}>");
  expect(dlg).toContain("No analysis time has been used.");
  expect(dlg).toContain('confirmLabel="Cancel upload"');
  expect(dlg).toContain('cancelLabel="Keep uploading"');
  // The trigger only opens; cancel() runs from onConfirm.
  expect(dlg).toContain("onClick={() => setOpen(true)}");
  expect(dlg).toMatch(/onConfirm=\{\(\) => \{\s*cancel\(\);/);
});

test("the upload meta line is sentence case per segment", () => {
  expect(src).toContain("sentenceCase(formatEta(progress.etaSeconds))");
});
