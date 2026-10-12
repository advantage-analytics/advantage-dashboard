"use client";

import { FileStepContent } from "@/components/dashboard/matches/new-match-wizard/FileStepContent";
import { VideoRequirementsDialog } from "@/components/dashboard/matches/new-match-wizard/VideoRequirementsDialog";
import type {
  FormData,
  VideoProbeSummary,
} from "@/components/dashboard/matches/new-match-wizard/types";
import { evaluateVideoProbe } from "@/lib/services/upload/validators/splitstep-validator";
import type { VideoProbe } from "@/lib/video/probe";

const noop = () => {};

/** A recording that clears every check; each state varies one field. */
const BASE: VideoProbe = {
  width: 1920,
  height: 1080,
  durationSeconds: 5412,
  fps: 30,
  averageFps: 29.97,
  mimeType: "video/mp4",
  sizeBytes: 3_200_000_000,
};

/**
 * Every state the file step shows on the video path. The strips carry the
 * validator's own words — the probes are fixed, the verdicts are real.
 */
const STATES: readonly {
  id: string;
  label: string;
  probe: VideoProbe | null;
}[] = [
  { id: "empty", label: "Before a video is added", probe: null },
  { id: "pass", label: "Passes — 30 fps", probe: BASE },
  {
    id: "sixty",
    label: "Passes — 60 fps",
    probe: { ...BASE, fps: 60, averageFps: 60 },
  },
  {
    id: "warn",
    label: "Accepted with a caution — averages 29.95 fps",
    probe: { ...BASE, averageFps: 29.95 },
  },
  {
    id: "low-fps",
    label: "Refused — 24 fps",
    probe: { ...BASE, fps: 24, averageFps: null },
  },
  {
    id: "low-res",
    label: "Refused — 720p",
    probe: { ...BASE, width: 1280, height: 720 },
  },
];

function State({ label, probe }: { label: string; probe: VideoProbe | null }) {
  const result = probe ? evaluateVideoProbe(probe) : null;
  const accepted = Boolean(result?.success);
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-[12px] font-medium text-[var(--ink-600)]">{label}</h2>
      <div className="rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] px-14 py-10">
        <FileStepContent
          kind="processing"
          selectedProvider="splitstep"
          subjectFirstName={null}
          uploadedFile={
            accepted
              ? {
                  name: "court-3-saturday.mp4",
                  size: "3.2 GB",
                  status: "ready",
                }
              : null
          }
          probe={accepted ? (probe as VideoProbeSummary) : null}
          warnings={accepted ? (result?.warnings ?? []) : []}
          notes={accepted ? (result?.notes ?? []) : []}
          busy={false}
          error={result && !result.success ? (result.error ?? null) : null}
          parsingState={{
            isParsing: false,
            parseError: null,
            parseWarnings: [],
            parseSuccess: false,
          }}
          formData={{} as FormData}
          acceptString=".mp4,.mov,.m4v,.avi,.mkv,.webm"
          isOver={false}
          onDragOver={noop}
          onDragLeave={noop}
          onDrop={noop}
          onFileChange={noop}
          onRemove={noop}
        />
      </div>
    </section>
  );
}

export function FileStepPreview({ dialogOpen }: { dialogOpen: boolean }) {
  return (
    <main className="min-h-screen bg-[var(--surface-page)] px-14 py-10">
      <h1 className="text-[16px] font-medium text-[var(--ink-900)]">
        Upload wizard — the file step
      </h1>
      <p className="mt-1 max-w-[60ch] text-[12px] leading-[1.6] text-[var(--ink-600)]">
        The video path, in each state. Add <code>?dialog=open</code> to see the
        requirements dialog.
      </p>
      {dialogOpen ? (
        <div className="mt-8">
          <VideoRequirementsDialog defaultOpen />
        </div>
      ) : (
        <div className="mt-8 flex max-w-[832px] flex-col gap-10">
          {STATES.map((s) => (
            <State key={s.id} label={s.label} probe={s.probe} />
          ))}
        </div>
      )}
    </main>
  );
}
