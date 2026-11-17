/**
 * VideoRequirements — the "Before you add a video" block above the file
 * step's drop zone, for the Advantage Intelligence (video) path only.
 * `VideoRequirementsFacts` is its tail — the middot facts and the dialog
 * link — which stays under the drop zone.
 *
 * It sits above the picker because the wrong download (a cut export, a 720p
 * stream) is decided before the file is chosen. It stays visible after, since
 * the trim step still has to honour the same framing.
 *
 * Deliberately NOT `"use client"`. The block holds no state, no effects and
 * no handlers — three rows and a native `<details>` disclosure. The dialog
 * link is the one client boundary and lives in `VideoRequirementsDialog`
 * (rendered by `VideoRequirementsFacts`), so this panel can still be rendered
 * from a Server Component.
 *
 * The shape: the requirements people get wrong lead as wizard field rows
 * (40px mark, 14px title, one micro line) — the whole match, unedited;
 * resolution and frame rate, which the probe checks; and the camera's view,
 * which nothing on this page can check, so that row shows the frame instead
 * (`CourtFrame`). Everything else is one middot line of facts, and the full
 * list sits behind "View all requirements".
 *
 * Once a video has passed the check, `result` turns the resolution row from
 * the rule into the answer: the measured value at the row's end and one line
 * saying how it did. The panel still takes only props.
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
  ChevronRight,
  Film,
  Scan,
  TriangleAlert,
  Video,
  type LucideIcon,
} from "lucide-react";
import { CourtFrame } from "./CourtFrame";
import { noteStripCls } from "./styles";
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
 * How the attached video did against the resolution row, once it has passed the check.
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

/** The measured value at the end of the resolution row, marked by how it did. */
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
  // The caution strip sits under the file row, below this block.
  warn: "Accepted · See the note below",
} as const;

export function VideoRequirements({
  result,
}: {
  result?: VideoRequirementResult;
}) {
  return (
    <div className="flex flex-col gap-5">
      <span className="eyebrow">Before you add a video</span>

      <div className="flex flex-col">
        <div className="flex items-start gap-4 border-b border-[var(--border-hairline)] pb-4">
          <RowMark icon={Film} />
          <RowText
            title="The full match, unedited"
            detail="Not a highlight or cut version · Keep the time between points"
          />
        </div>

        <div className="flex items-start gap-4 border-b border-[var(--border-hairline)] py-4">
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
            title="Filmed from behind the baseline"
            detail="Behind the back fence · Show the far service line and the space behind the near baseline"
          />
          <CourtFrame
            variant="works"
            className="block w-[144px] shrink-0 rounded-[var(--radius-button)]"
          />
        </div>
      </div>

      {/* Where the 720p streams and cut exports came from. Says what to
          download, not which menu to open: neither app's menus are ours to
          keep current. */}
      <details className="group">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-[var(--radius-button)] text-[12px] leading-4 text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] [&::-webkit-details-marker]:hidden">
          <ChevronRight
            className="size-3 transition-transform duration-200 ease-[var(--ease-out-expo)] group-open:rotate-90"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          Using PlaySight or CIZR?
        </summary>
        <div className={`mt-2.5 ${noteStripCls}`}>
          <span className="flex flex-col gap-0.5">
            <span>
              <b className="font-medium text-[var(--ink-900)]">PlaySight:</b>{" "}
              download the original file, not the stream.
            </span>
            <span>
              <b className="font-medium text-[var(--ink-900)]">CIZR:</b>{" "}
              download the full match, not the edited version.
            </span>
            <span>
              If there&apos;s a quality setting, pick 1080p or higher.
            </span>
          </span>
        </div>
      </details>
    </div>
  );
}

/** The rest of the requirements, under the drop zone: facts and the dialog. */
export function VideoRequirementsFacts() {
  return (
    <div className="flex flex-col items-start gap-2">
      <span className="text-micro leading-4">
        One camera that doesn&apos;t move · Singles · Complete games · Under 8
        GB
      </span>
      <VideoRequirementsDialog />
    </div>
  );
}
