import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { FileStepContent } from "@/components/dashboard/matches/new-match-wizard/FileStepContent";
import type { FormData } from "@/components/dashboard/matches/new-match-wizard/types";
import { AttachmentFileStep } from "@/components/dashboard/matches/match-video-attachment/AttachmentFileStep";

/**
 * Both upload drop zones — the new-match wizard's file step and the match
 * video attachment's — with `busy` driven from the spec through
 * `window.setBusy`, so a test can rewrite the zone's DOM the way a browser
 * page translator does and then make React commit the "checking" swap.
 *
 * React errors are parked on `window.reactErrors` (the root's
 * `onUncaughtError` / `onCaughtError`), which is where a commit-phase
 * `removeChild` NotFoundError lands.
 */

interface TranslationHarnessWindow {
  setBusy: (busy: boolean) => void;
  reactErrors: string[];
}

const harness = window as unknown as TranslationHarnessWindow;
const noop = () => {};

function Harness({ zone }: { zone: "wizard" | "attachment" }) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    harness.setBusy = setBusy;
    document.documentElement.dataset.hydrated = "true";
  }, []);

  if (zone === "attachment") {
    return (
      <AttachmentFileStep
        state={
          busy
            ? { status: "checking", filename: "match.mp4", sizeBytes: 1024 }
            : { status: "empty" }
        }
        mode="add"
        isOver={false}
        onDragOver={noop}
        onDragLeave={noop}
        onDrop={noop}
        onFileChange={noop}
        onRemove={noop}
      />
    );
  }

  return (
    <FileStepContent
      kind="processing"
      selectedProvider={null}
      subjectFirstName={null}
      uploadedFile={null}
      probe={null}
      warnings={[]}
      busy={busy}
      error={null}
      parsingState={{
        isParsing: false,
        parseError: null,
        parseWarnings: [],
        parseSuccess: false,
      }}
      formData={{} as FormData}
      acceptString=".mp4,.mov"
      isOver={false}
      onDragOver={noop}
      onDragLeave={noop}
      onDrop={noop}
      onFileChange={noop}
      onRemove={noop}
    />
  );
}

harness.reactErrors = [];
const record = (error: unknown) =>
  harness.reactErrors.push(String((error as Error)?.message ?? error));
const zone =
  new URLSearchParams(location.search).get("zone") === "attachment"
    ? "attachment"
    : "wizard";
createRoot(document.getElementById("root")!, {
  onUncaughtError: record,
  onCaughtError: record,
}).render(<Harness zone={zone} />);
