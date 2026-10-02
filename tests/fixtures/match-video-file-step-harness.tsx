import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { AttachmentFileStep } from "@/components/dashboard/matches/match-video-attachment/AttachmentFileStep";
import {
  confirmPlayableLocally,
  useAttachmentFile,
  type AttachmentSelection,
} from "@/components/dashboard/matches/match-video-attachment/use-attachment-file";
import type { FileStepHarnessWindow } from "./match-video-file-step-window";

/**
 * Browser harness for the attachment file step.
 *
 * Fixtures are fetched ONCE before React mounts and parked on `window`, so a
 * test can build a `File` at selection time without touching the network.
 * That is what makes "no upload happens on selection" assertable: the spec
 * starts recording requests after `data-hydrated`, and a passing run records
 * none at all.
 */

const harness = window as unknown as FileStepHarnessWindow;

const FIXTURES = [
  "h264-faststart.mp4",
  "h264.mov",
  "vp9.webm",
  "vp9.mkv",
  "audio-only.webm",
];

function Harness({ mode }: { mode: "add" | "replace" }) {
  // The selection log lives on `window`, so a render is forced when it grows
  // only to keep React's state and the log in step for a watching test.
  const [, force] = useState(0);
  const api = useAttachmentFile({
    onSelectionChange: (selection: AttachmentSelection | null) => {
      harness.selectionEvents.push(
        selection
          ? {
              filename: selection.filename,
              contentType: selection.contentType,
              durationSeconds: selection.durationSeconds,
            }
          : null,
      );
      force((n) => n + 1);
    },
  });

  useEffect(() => {
    harness.selectFile = api.select;
    document.documentElement.dataset.hydrated = "true";
  }, [api.select]);

  return (
    <AttachmentFileStep
      state={api.state}
      mode={mode}
      isOver={api.isOver}
      onDragOver={api.onDragOver}
      onDragLeave={api.onDragLeave}
      onDrop={api.onDrop}
      onFileChange={api.onFileChange}
      onRemove={api.remove}
    />
  );
}

async function boot() {
  harness.selectionEvents = [];
  harness.fixtures = {};
  for (const name of FIXTURES) {
    harness.fixtures[name] = await (
      await fetch(`/fixtures/${name}`)
    ).arrayBuffer();
  }
  harness.fileFrom = (fixture, name) =>
    new File([harness.fixtures[fixture]], name);
  harness.confirmPlayable = async (blob) => {
    const result = await confirmPlayableLocally(
      blob,
      new AbortController().signal,
    );
    return {
      ok: result.ok,
      detail: result.ok ? "" : result.error.detail,
    };
  };

  const params = new URLSearchParams(location.search);
  const mode = params.get("mode") === "replace" ? "replace" : "add";
  createRoot(document.getElementById("root")!).render(<Harness mode={mode} />);
}

void boot();
