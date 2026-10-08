/**
 * VideoRequirements — the "what the analysis needs" block under the file
 * step's drop zone, for the Advantage Intelligence (video) path only.
 *
 * Deliberately NOT `"use client"`. The block itself holds no state, no
 * effects and no handlers — two rows, a line of facts, and a link. The link
 * opens a dialog, and that is the one client boundary: it lives in
 * `VideoRequirementsDialog`, so this panel can still be rendered from a Server
 * Component if the guidance is ever wanted somewhere outside the wizard.
 *
 * The shape: the two requirements people get wrong lead as wizard field rows
 * (40px mark, 14px title, one micro line) — resolution and frame rate, which
 * the probe checks, and the camera's view, which nothing on this page can
 * check, so the row shows the frame instead (`CourtFrame`). Everything else is
 * one middot line of facts, and the full list sits behind "View all
 * requirements" with a frame that works beside one that does not. It was a
 * spec line and four equal rows; the two that decide whether a video can be
 * analysed read no louder than the file-size limit.
 *
 * Once a video has passed the check, `result` turns row 1 from the rule into
 * the answer: the measured value at the row's end and one line saying how it
 * did. The panel still takes only props — no state came with it.
 *
 * It renders before a file is chosen and stays visible after, since the trim
 * step still has to honour the same framing — see `FileStepContent`'s render
 * order, which keeps this below the drop zone's own error/progress states.
 *
 * Every number and claim is the provider's own, checked against
 * https://splitstep.ai/api-docs.html (Video Guidelines / error codes) on
 * 2026-09-10 — see `work/upload-flow-refinements/01_brief/output/brief.md`
 * §"Also consulted" and `02_design/output/design.md`'s Video requirements
 * section. Nothing here gives a measured outside-court margin — the guide
 * never gave one, so a figure would be invented, not sourced. Aligning
 * `useUploadMatchWizard`'s probe/validator thresholds to this copy is a
 * separate, later task — this component only presents guidance.
 */

import {
  Check,
  Scan,
  TriangleAlert,
  Video,
  type LucideIcon,
} from "lucide-react";
import { CourtFrame } from "./CourtFrame";
import { VideoRequirementsDialog } from "./VideoRequirementsDialog";

/** The 40px lead of a wizard field row. */
function RowMark({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-button)] bg-[var(--surface-subtle)]">
      <Icon
        className="size-4 text-[var(--ink-700)]"
        strokeWidth={1.5}
        aria-hidden="true"
      />
    </span>
  );
}

function RowText({ title, detail }: { title: string; detail: string }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[14px] leading-5 text-[var(--ink-900)]">
        {title}
      </span>
      <span className="text-micro leading-4">{detail}</span>
    </span>
  );
}

/**
 * How the attached video did against row 1, once it has passed the check.
 * `label` is what the probe measured ("1080p · 29.95 fps"). There is no
 * "fail": a refused file is not attached, and the strip under the drop zone
 * says why.
 */
export interface VideoRequirementResult {
  status: "pass" | "warn";
  label: string;
  /** One clause on how a passing video could be better, e.g. the 60 fps nudge. */
  suggestion?: string;
}

/** The measured value at the end of row 1, marked by how it did. */
function ResultReadout({ result }: { result: VideoRequirementResult }) {
  const warn = result.status === "warn";
  const Mark = warn ? TriangleAlert : Check;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-2 self-center ${
        warn ? "text-[var(--warning-text)]" : "text-[var(--ink-700)]"
      }`}
    >
      <Mark
        className={`size-3.5 ${warn ? "" : "text-[var(--blue)]"}`}
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <span className="mono tabular text-[11px] leading-4">{result.label}</span>
    </span>
  );
}

const QUALITY_DETAIL = {
  none: "Checked when you add the file · 60 fps is better",
  pass: "This video meets it",
  warn: "Accepted · See the note above",
} as const;

export function VideoRequirements({
  result,
}: {
  result?: VideoRequirementResult;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-5">
        <span className="eyebrow">What the analysis needs</span>

        <div className="flex flex-col">
          <div className="flex items-start gap-4 border-b border-[var(--border-hairline)] pb-4">
            <RowMark icon={Video} />
            <RowText
              title="1080p at 30 fps or higher"
              detail={
                result?.status === "pass" && result.suggestion
                  ? `${QUALITY_DETAIL.pass} · ${result.suggestion}`
                  : QUALITY_DETAIL[result?.status ?? "none"]
              }
            />
            {result && <ResultReadout result={result} />}
          </div>

          <div className="flex items-center gap-4 pt-4">
            <RowMark icon={Scan} />
            <RowText
              title="Camera behind the back fence"
              detail="Show the far service line and the space behind the near baseline · Yours to check"
            />
            <CourtFrame
              variant="works"
              className="block w-[144px] shrink-0 rounded-[var(--radius-button)]"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col items-start gap-2">
        <span className="text-micro leading-4">
          Uncut, with the time between points · One camera that doesn&apos;t
          move · Singles · Complete games · Under 8 GB
        </span>
        <VideoRequirementsDialog />
      </div>
    </div>
  );
}
