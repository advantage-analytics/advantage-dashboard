import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import { AttachmentAlignmentStep } from "@/components/dashboard/matches/match-video-attachment/AttachmentAlignmentStep";
import {
  useAttachmentAlignment,
  type AlignmentSource,
} from "@/components/dashboard/matches/match-video-attachment/use-attachment-alignment";
import type {
  Alignment,
  SourcePoint,
  SourceShot,
} from "@/lib/match-video/alignment";
import type { AlignmentHarnessWindow } from "./match-video-alignment-step-window";

/**
 * Browser harness for the attachment alignment step.
 *
 * The scenario table is the point: every case the step has to get right is a
 * different shape of imported data, and the arithmetic must be deterministic,
 * so each scenario declares its own duration rather than depending on whatever
 * the fixture clip happens to measure. The clip is only ever the thing being
 * played; the numbers come from here.
 */

const harness = window as unknown as AlignmentHarnessWindow;

interface Scenario {
  points: SourcePoint[];
  shots: SourceShot[];
  /** Coverage duration. Independent of the fixture clip's own two seconds. */
  declaredDurationSeconds?: number;
  savedConfirmedSeconds?: number | null;
}

const SCENARIOS: Record<string, Scenario> = {
  /**
   * The workhorse. Anchor at 10s, a shot five seconds before it, the final
   * point ending at 95s, inside a 100s file.
   *
   *   videoStart = confirmed - 5      (earliest 5s, offset 10 - confirmed)
   *   videoEnd   = confirmed + 85     (required end 95s)
   *
   * so 4.5 breaks the start edge, 4.95 sits inside tolerance, 15 lands exactly
   * on the end, 15.05 is inside tolerance and 16 is past it.
   */
  main: {
    points: [
      { pointNumber: 1, videoTime: 10, duration: 1 },
      { pointNumber: 2, videoTime: 90, duration: 5 },
    ],
    shots: [{ videoTime: 5 }],
    declaredDurationSeconds: 100,
  },

  /** `main`, re-opened on a saved attachment already aligned at 5.000. */
  correction: {
    points: [
      { pointNumber: 1, videoTime: 10, duration: 1 },
      { pointNumber: 2, videoTime: 90, duration: 5 },
    ],
    shots: [{ videoTime: 5 }],
    declaredDurationSeconds: 100,
    savedConfirmedSeconds: 5,
  },

  /** A recording that genuinely opens on the serve: zero is valid here. */
  zeroable: {
    points: [{ pointNumber: 1, videoTime: 0.5, duration: 1 }],
    shots: [],
    declaredDurationSeconds: 100,
  },

  /** One interior point and one shot came out of the import with no time. */
  untimed: {
    points: [
      { pointNumber: 1, videoTime: 10, duration: 1 },
      { pointNumber: 2, videoTime: null, duration: null },
      { pointNumber: 3, videoTime: 90, duration: 5 },
    ],
    shots: [{ videoTime: null }, { videoTime: 5 }],
    declaredDurationSeconds: 100,
  },

  /** The first point has no timestamp at all — nothing to align against. */
  missing: {
    points: [{ pointNumber: 1, videoTime: null, duration: null }],
    shots: [],
    declaredDurationSeconds: 100,
  },
};

function Harness({
  scenario,
  source,
  mode,
}: {
  scenario: Scenario;
  source: AlignmentSource;
  mode: "add" | "replace" | "align";
}) {
  const [, force] = useState(0);
  const options = useMemo(
    () => ({
      source,
      points: scenario.points,
      shots: scenario.shots,
      declaredDurationSeconds: scenario.declaredDurationSeconds,
      savedConfirmedSeconds: scenario.savedConfirmedSeconds ?? null,
      onAlignmentChange: (alignment: Alignment | null) => {
        harness.alignmentEvents.push(
          alignment
            ? {
                offsetSeconds: alignment.offsetSeconds,
                confirmedVideoTimeSeconds: alignment.confirmedVideoTimeSeconds,
              }
            : null,
        );
        force((n) => n + 1);
      },
    }),
    [scenario, source],
  );

  const api = useAttachmentAlignment(options);

  useEffect(() => {
    harness.playheadSeconds = () => api.videoRef.current?.currentTime ?? -1;
    document.documentElement.dataset.hydrated = "true";
  }, [api.videoRef]);

  return <AttachmentAlignmentStep api={api} mode={mode} />;
}

async function boot() {
  harness.alignmentEvents = [];

  const realPlay = HTMLMediaElement.prototype.play;
  harness.rejectPlay = (name) => {
    HTMLMediaElement.prototype.play = function rejecting() {
      return Promise.reject(new DOMException("blocked by the harness", name));
    };
  };
  harness.restorePlay = () => {
    HTMLMediaElement.prototype.play = realPlay;
  };
  harness.failMedia = () => {
    document
      .querySelector('[data-testid="alignment-video"]')!
      .dispatchEvent(new Event("error"));
  };

  const params = new URLSearchParams(location.search);
  const scenario =
    SCENARIOS[params.get("scenario") ?? "main"] ?? SCENARIOS.main;
  const mode = (params.get("mode") ?? "add") as "add" | "replace" | "align";

  // The local path must issue no request at all, so its bytes are fetched
  // BEFORE React mounts and handed over as a `File` — exactly as the file
  // step's harness does. The saved path is a URL by definition and is the one
  // case where the element legitimately goes to the network.
  let source: AlignmentSource;
  if (params.get("source") === "saved") {
    source = { kind: "saved", url: "/fixtures/h264-faststart.mp4" };
  } else {
    const bytes = await (
      await fetch("/fixtures/h264-faststart.mp4")
    ).arrayBuffer();
    source = {
      kind: "local",
      file: new File([bytes], "match.mp4", { type: "video/mp4" }),
    };
  }

  createRoot(document.getElementById("root")!).render(
    <Harness scenario={scenario} source={source} mode={mode} />,
  );
}

void boot();
