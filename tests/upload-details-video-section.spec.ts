import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { UPLOADING_COPY } from "@/components/dashboard/matches/upload-progress-copy";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The Video section at the foot of the wizard's Details step: the file that
 * Save match is about to upload, and the instruction to keep the tab open and
 * the computer awake — said once before the upload exists, in the same strip
 * the upload screens use while it runs.
 *
 * Two layers, like `upload-player-details.spec.ts`:
 *   1. The shared pieces rendered for real — `CheckedFileRow`,
 *      `videoFileFacts` and `UploadNoteStrip`.
 *   2. Source assertions on `DetailsStepContent.tsx`, `FileStepContent.tsx`
 *      and `UploadWizardSteps.tsx` for the wiring a static render of a
 *      ~2,000-line step cannot observe cheaply: when the section shows, where
 *      it sits, and that both steps draw the one row.
 */

const WIZARD = "src/components/dashboard/matches/new-match-wizard";
const read = (file: string) =>
  readFileSync(resolve(process.cwd(), file), "utf8");

const loader = createLoader();
const { CheckedFileRow, VideoFileLead, videoFileFacts, videoUploadFacts } =
  loader.load(`${WIZARD}/CheckedFileRow.tsx`) as {
    CheckedFileRow: React.ComponentType<Record<string, unknown>>;
    VideoFileLead: React.ComponentType<Record<string, unknown>>;
    videoFileFacts: (
      probe: Record<string, unknown> | null,
      size: string | undefined,
      tail?: string,
    ) => string | null;
    videoUploadFacts: (
      probe: Record<string, unknown> | null,
      size: string | undefined,
      keptSeconds: number | null,
    ) => string | null;
  };
const { UploadNoteStrip } = loader.load(
  "src/components/dashboard/matches/upload-keep-open-note.tsx",
) as { UploadNoteStrip: React.ComponentType<Record<string, unknown>> };

const PROBE = { width: 1920, height: 1080, durationSeconds: 4336, fps: 30 };

test("the facts line reads duration, resolution, rate and size; 'checked' is the file step's alone", () => {
  expect(videoFileFacts(PROBE, "3.80 GB")).toBe(
    "1:12:16 · 1080p · 30 fps · 3.80 GB",
  );
  expect(videoFileFacts(PROBE, "3.80 GB", "checked")).toBe(
    "1:12:16 · 1080p · 30 fps · 3.80 GB · checked",
  );
  expect(videoFileFacts(null, "3.80 GB")).toBeNull();
});

test("a trimmed upload reads the kept length against the recording's, with no size", () => {
  // The whole clip, or no window chosen: the file's own facts.
  expect(videoUploadFacts(PROBE, "3.80 GB", null)).toBe(
    "1:12:16 · 1080p · 30 fps · 3.80 GB",
  );
  expect(videoUploadFacts(PROBE, "3.80 GB", 4336)).toBe(
    "1:12:16 · 1080p · 30 fps · 3.80 GB",
  );
  // Within a second of the whole clip is the whole clip.
  expect(videoUploadFacts(PROBE, "3.80 GB", 4335.5)).toBe(
    "1:12:16 · 1080p · 30 fps · 3.80 GB",
  );
  // A real cut: the size shown would be the uncut file's, so it is left off.
  expect(videoUploadFacts(PROBE, "3.80 GB", 3480)).toBe(
    "0:58:00 of 1:12:16 · 1080p · 30 fps",
  );
  expect(videoUploadFacts(null, "3.80 GB", 3480)).toBeNull();
});

test("the row draws lead, name and facts; actions and the hairline are the caller's", () => {
  const bare = renderToStaticMarkup(
    React.createElement(CheckedFileRow, {
      lead: React.createElement("i", { "data-lead": "" }),
      name: "match-sep-30.mp4",
      facts: "1:12:16 · 1080p · 30 fps · 3.80 GB",
    }),
  );
  expect(bare).toContain("data-lead");
  expect(bare).toContain("match-sep-30.mp4");
  expect(bare).toContain("1:12:16 · 1080p · 30 fps · 3.80 GB");
  expect(bare).not.toContain("border-b");
  expect(bare).not.toContain("<button");

  const withActions = renderToStaticMarkup(
    React.createElement(
      CheckedFileRow,
      { lead: null, name: "a.mp4", facts: "x", ruled: true },
      React.createElement("button", { type: "button" }, "Replace"),
    ),
  );
  expect(withActions).toContain("border-b");
  expect(withActions).toContain("Replace");
});

test("without the File the lead falls back to the film glyph, never a broken still", () => {
  const html = renderToStaticMarkup(
    React.createElement(VideoFileLead, { file: null, durationSeconds: 0 }),
  );
  expect(html).not.toContain("<video");
  expect(html).toContain("<svg");
  expect(html).toContain("bg-[var(--ink-900)]");
});

test("the before-save note is the upload screens' strip: monitor, medium lead, no estimate", () => {
  expect(UPLOADING_COPY.beforeSave).toBe(
    "Uploading starts when you save. It runs in this tab, so keep the tab open and your computer awake until it finishes. A full match can take an hour or more on home Wi-Fi.",
  );
  const html = renderToStaticMarkup(
    React.createElement(UploadNoteStrip, null, UPLOADING_COPY.beforeSave),
  );
  expect(html).toContain(
    '<b class="font-medium">Uploading starts when you save.</b>',
  );
  expect(html).toContain("lucide-monitor");
  expect(html).toContain("bg-[var(--surface-subtle)]");
  // Nothing has been measured yet, so nothing that reads as a forecast.
  expect(UPLOADING_COPY.beforeSave).not.toMatch(/\d/);
  expect(UPLOADING_COPY.beforeSave).not.toMatch(/about|left|remaining/i);
});

test("Details draws the section last, for a processing provider that holds the file", () => {
  const src = read(`${WIZARD}/DetailsStepContent.tsx`);
  const context = src.indexOf('<SectionHead label="Context"');
  const gate = src.indexOf("{isProcessingProvider && video && (");
  const head = src.indexOf(
    '<SectionHead label="Video" micro="what uploads when you save" />',
  );
  const row = src.indexOf("<CheckedFileRow", gate);
  const note = src.indexOf(
    "<UploadNoteStrip>{UPLOADING_COPY.beforeSave}</UploadNoteStrip>",
  );
  expect(context).toBeGreaterThan(-1);
  expect(gate).toBeGreaterThan(context);
  expect(head).toBeGreaterThan(gate);
  expect(row).toBeGreaterThan(head);
  expect(note).toBeGreaterThan(row);

  // Context's own frame: hairline above, 18px between head and body.
  const frame =
    'className="flex flex-col gap-[18px] border-t border-[var(--border-hairline)] pt-6"';
  expect(src.slice(context - 200, context)).toContain(frame);
  expect(src.slice(gate, head)).toContain(frame);

  // No Replace or Remove here — the file is changed on its own step.
  const section = src.slice(gate, note);
  expect(section).not.toContain("Replace");
  expect(section).not.toContain("onRemove");
  expect(section).not.toContain("<button");
  // The copy is the shared module's, not retyped.
  expect(src).not.toContain("Uploading starts when you save");
});

test("the flow hands Details a video only while it holds the File, and never for an import", () => {
  const src = read(`${WIZARD}/UploadWizardSteps.tsx`);
  expect(src).toContain(
    "const heldFile = isProcessingProvider ? (uploadedFile?.file ?? null) : null;",
  );
  const memo = src.slice(src.indexOf("const video = useMemo("));
  expect(memo.slice(0, 400)).toContain("heldFile");
  expect(memo.slice(0, 400)).toContain(": null,");
  // What uploads is the trim window, so Details is told its length.
  expect(memo.slice(0, 400)).toContain(
    "keptSeconds: trimSelected > 0 ? trimSelected : null,",
  );
  expect(read(`${WIZARD}/DetailsStepContent.tsx`)).toContain(
    "videoUploadFacts(video.probe, video.size, video.keptSeconds)",
  );
  expect(src).toContain("video={video}");
});

test("the file step draws the same row and keeps no copy of it", () => {
  const src = read(`${WIZARD}/FileStepContent.tsx`);
  expect(src).toContain("<CheckedFileRow");
  expect(src).toContain("<VideoFileLead");
  expect(src).toContain('videoFileFacts(probe, uploadedFile?.size, "checked")');
  expect(src).not.toContain("function VideoStill");
  // Its own actions stay on its own step.
  const row = src.slice(
    src.indexOf("<CheckedFileRow"),
    src.indexOf("</CheckedFileRow>"),
  );
  expect(row).toContain("Replace");
  expect(row).toContain("onClick={onRemove}");
});
