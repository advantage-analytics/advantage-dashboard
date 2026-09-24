import { createRoot } from "react-dom/client";

import { MatchVideoAttachmentFlow } from "@/components/dashboard/matches/match-video-attachment/MatchVideoAttachmentFlow";
import type { AttachmentFlowDeps } from "@/components/dashboard/matches/match-video-attachment/use-attachment-flow";
import type { SourcePoint, SourceShot } from "@/lib/match-video/alignment";
import { defaultAttachmentTrimWindow } from "@/lib/match-video/trim-window";
import type { ActiveAttachment, MatchVideoMode } from "@/lib/match-video/types";
import type {
  AttachmentFlowHarnessWindow,
  AttachmentFlowPrepareCall,
} from "./match-video-attachment-flow-window";

/**
 * Browser harness for the attachment orchestration flow.
 *
 * Unlike the two step harnesses, this one DOES talk to the network — that is
 * the point of the step it exercises. The spec's own server implements the four
 * endpoints, and the scenario is carried in the match id (`ok-…`, `slow-…`,
 * `failonce-…`) so tests running in parallel never share server state.
 *
 * Nothing is stubbed on this side: the real `transferAttachment` runs, over
 * real `XMLHttpRequest`, against a real blob URL. What a test observes is
 * therefore the complete set of requests the flow makes — which is how "this
 * flow creates no match, no draft and no analysis job" is proven rather than
 * asserted.
 *
 * The source timing is scaled to the two-second fixture clip:
 *
 *   anchor 1.000s · earliest known instant 0.900s · final point ends 1.600s
 *
 * so a confirmed first point at T gives offset `1 - T`, needs video from
 * `T - 0.1` to `T + 0.6`, and is covered by the clip for T in [0.1, 1.4].
 * 00:00:00.500 is the workhorse; 00:00:01.900 is past the end.
 *
 * ── The cut ──
 *
 * The real remux runs in a worker over OPFS and is covered by its own specs;
 * here `prepare` is always a fake, chosen by `?prepare=`:
 *
 *   skip (default)  resolves `{ trimmed: false, reason: "whole-clip" }`
 *   cut             resolves a cut: the first half of the picked file's bytes
 *   hold            reports 50%, then waits for `releasePrepare()` to cut
 *
 * A ten-second pad would keep the whole two-second clip, so `?pad=` shortens
 * it — through the flow's `trimWindow` seam, the real window maths otherwise.
 */

/** Rejects once the signal aborts, the way `prepareVideoForUpload` does. */
function abortable(signal: AbortSignal | undefined): Promise<never> {
  return new Promise((_, reject) => {
    signal?.addEventListener("abort", () => reject(new Error("cancelled")), {
      once: true,
    });
  });
}

function fakeDeps(params: URLSearchParams): Partial<AttachmentFlowDeps> {
  const kind = params.get("prepare") ?? "skip";
  const padParam = params.get("pad");
  const padSeconds = padParam === null ? undefined : Number(padParam);
  let storageCounter = 0;
  let release: () => void = () => {};
  harness.releasePrepare = () => release();

  const prepare: AttachmentFlowDeps["prepare"] = async (file, options) => {
    const call: AttachmentFlowPrepareCall = {
      filename: file.name,
      sizeBytes: file.size,
      startSeconds: options.startSeconds,
      endSeconds: options.endSeconds,
    };
    harness.prepareCalls.push(call);

    if (kind === "skip") {
      call.result = { trimmed: false, sizeBytes: file.size };
      return { trimmed: false, file, reason: "whole-clip" };
    }

    if (kind === "hold") {
      options.onProgress?.(0.5);
      try {
        await Promise.race([
          new Promise<void>((done) => (release = done)),
          abortable(options.signal),
        ]);
      } catch (error) {
        call.cancelled = true;
        throw error;
      }
    }

    options.onProgress?.(1);
    storageCounter += 1;
    const storageName = `prepared-video-fake-${storageCounter}.mp4`;
    const cut = new File(
      [file.slice(0, Math.ceil(file.size / 2))],
      file.name.replace(/\.[^.]+$/, "") + ".trimmed.mp4",
      { type: "video/mp4" },
    );
    call.result = { trimmed: true, sizeBytes: cut.size, storageName };
    return {
      trimmed: true,
      file: cut,
      durationSeconds: options.endSeconds - options.startSeconds,
      storageName,
    };
  };

  return {
    prepare,
    discardPrepared: async (storageName) => {
      harness.discardCalls.push(storageName);
    },
    trimWindow: (input) =>
      defaultAttachmentTrimWindow({
        ...input,
        padSeconds: padSeconds ?? input.padSeconds,
      }),
  };
}

const harness = window as unknown as AttachmentFlowHarnessWindow;

const POINTS: SourcePoint[] = [
  { pointNumber: 1, videoTime: 1, duration: 0.2 },
  { pointNumber: 2, videoTime: 1.4, duration: 0.2 },
];
const SHOTS: SourceShot[] = [{ videoTime: 0.9 }];

/** The attachment a replace supersedes and an adjust corrects. */
const ACTIVE: ActiveAttachment = {
  id: "6f1d4a7e-2c83-4a51-9f0e-1b7c5d3e9a42",
  version: 3,
  offsetSeconds: 0.5,
  confirmedVideoTimeSeconds: 0.5,
  // The server-verified duration of the PUBLISHED file, which is not the
  // fixture clip: a correction is measured against what the server stored.
  durationSeconds: 100,
  contentType: "video/mp4",
  filename: "roland-garros-r1.mp4",
};

function boot() {
  harness.savedEvents = [];
  harness.prepareCalls = [];
  harness.discardCalls = [];

  const params = new URLSearchParams(location.search);
  const mode = (params.get("mode") ?? "add") as MatchVideoMode;
  const matchId = params.get("matchId") ?? "ok-default";
  // "the video was replaced or removed in another tab": a mode that requires
  // an active attachment, opened without one.
  const vanished = params.get("vanished") === "1";

  const root = createRoot(document.getElementById("root")!);
  harness.unmount = () => root.unmount();

  root.render(
    <MatchVideoAttachmentFlow
      matchId={matchId}
      mode={mode}
      match={{
        playerName: "Marcus Reid",
        opponentName: "Jordan Alvarez",
        date: "2026-04-18",
        eventName: "Spring Invitational",
        score: "6-4, 7-5",
      }}
      points={POINTS}
      shots={SHOTS}
      activeAttachment={mode === "add" || vanished ? null : ACTIVE}
      savedPlaybackUrl={
        mode === "align" ? "/fixtures/h264-faststart.mp4" : null
      }
      returnTarget={{ href: "/dashboard/matches/m1", label: "the match" }}
      deps={fakeDeps(params)}
      onSaved={(attachment) => {
        harness.savedEvents.push({
          id: attachment.id,
          version: attachment.version,
          confirmedVideoTimeSeconds: attachment.confirmedVideoTimeSeconds,
          offsetSeconds: attachment.offsetSeconds,
        });
      }}
    />,
  );

  document.documentElement.dataset.hydrated = "true";
}

boot();
