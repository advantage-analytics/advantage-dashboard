import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { TrimStepContent } from "@/components/dashboard/matches/new-match-wizard/TrimStepContent";
import type { VideoProbeSummary } from "@/components/dashboard/matches/new-match-wizard/types";
import type { TrimHarnessWindow } from "./trim-step-window";

/**
 * Browser harness for the wizard's trim step.
 *
 * `TrimStepContent` takes everything it needs as props — the File, the probe,
 * both cuts and the two callbacks — so it mounts outside the wizard with no
 * provider and no route. The harness plays the part the wizard's form state
 * plays: it records every `onTrimChange` and then re-renders with the cuts it
 * was handed, which is what makes a second key press measure against the first
 * one's result rather than the initial props.
 *
 * The probe is declared here rather than measured, exactly as the alignment
 * harness declares its coverage durations: the step clamps every seek to
 * `probe.durationSeconds`, so a spec that wants to prove the clamp needs to
 * name the number rather than inherit whatever the fixture clip measures. The
 * clip itself is the real two seconds of media the element decodes.
 */

const harness = window as unknown as TrimHarnessWindow;

/** The fixture clip: 64x64, 30fps, exactly 2.000s (tests/fixtures/match-video). */
const CLIP_SECONDS = 2;
const CLIP_FPS = 30;

function Harness({
  file,
  probe,
  initialStart,
  initialEnd,
}: {
  file: File;
  probe: VideoProbeSummary;
  initialStart: number;
  initialEnd: number;
}) {
  const [trim, setTrim] = useState({ start: initialStart, end: initialEnd });

  const onTrimChange = useCallback(
    (startSeconds: number, endSeconds: number) => {
      harness.trimEvents.push({ startSeconds, endSeconds });
      setTrim({ start: startSeconds, end: endSeconds });
    },
    [],
  );

  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);

  return (
    <TrimStepContent
      videoFile={file}
      probe={probe}
      startSeconds={trim.start}
      endSeconds={trim.end}
      // Zero, so the "too short" strip never competes for the assertions here.
      // The floor is the provider's business and has its own coverage.
      minTrimSeconds={0}
      subjectFirstName={null}
      fixedCamera={undefined}
      initialTopPlayerIsPlayer1={undefined}
      onTrimChange={onTrimChange}
      onAnswer={() => undefined}
    />
  );
}

function number(
  params: URLSearchParams,
  key: string,
  fallback: number,
): number {
  const raw = params.get(key);
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

async function boot() {
  harness.trimEvents = [];
  harness.playheadSeconds = () =>
    document.querySelector("video")?.currentTime ?? -1;
  harness.seekTo = (seconds) => {
    const el = document.querySelector("video");
    if (el) el.currentTime = seconds;
  };

  const params = new URLSearchParams(location.search);
  const durationSeconds = number(params, "duration", CLIP_SECONDS);

  // The step reads bytes through an object URL and issues no request of its
  // own, so the clip is fetched here and handed over as a `File` — the same
  // shape the file step passes along in the real wizard.
  const bytes = await (
    await fetch("/fixtures/h264-faststart.mp4")
  ).arrayBuffer();
  const file = new File([bytes], "match.mp4", { type: "video/mp4" });

  const probe: VideoProbeSummary = {
    width: 64,
    height: 64,
    durationSeconds,
    fps: CLIP_FPS,
    mimeType: "video/mp4",
    sizeBytes: bytes.byteLength,
  };

  createRoot(document.getElementById("root")!).render(
    <Harness
      file={file}
      probe={probe}
      initialStart={number(params, "start", 0)}
      initialEnd={number(params, "end", durationSeconds)}
    />,
  );
}

void boot();
