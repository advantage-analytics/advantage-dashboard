import { ChevronDown, Film } from "lucide-react";
import { StepIndicator } from "@/components/dashboard/matches/new-match-wizard/StepIndicator";
import { CONTENT_CLS } from "@/components/dashboard/matches/new-match-wizard/styles";
import {
  STEP_ORDER_BY_KIND,
  type Step,
} from "@/components/dashboard/matches/new-match-wizard/types";
import { stepHeading } from "@/components/dashboard/matches/new-match-wizard/wizard-view";
import { cn } from "@/lib/utils";
import { PendingBar, PendingFrame } from "./pending";
import { PinnedLinePending } from "./score-flow-pending";

/**
 * The upload wizard's route skeleton — `/dashboard/team/upload` (`pinned`) and
 * `/dashboard/matches/new` — drawn in `UploadMatchFlow`'s own geometry on the
 * step each route opens on, so nothing moves when the wizard lands.
 *
 * Which step, read off `useUploadMatchWizard`, not guessed:
 *
 *   - **pinned → the file step.** A lineup slot arrives with step 1 answered
 *     (`firstStep = preset ? "file" : "provider"`; the seed effect sets
 *     `setStep("file")` on a video flow). Every in-app link into
 *     `team/upload` carries `?entry=`, so this is the shape to mirror; the
 *     bare staff queue list briefly shows it too, which is accepted.
 *   - **unpinned → the provider step.** A fresh wizard opens on
 *     Workspace · For · Source. A personal visitor with a stored source can
 *     resume onto the file step after mount, but that is decided from
 *     `localStorage` in an effect, which the server cannot see.
 *
 * Both count the video flow's four steps: the hook builds the bar at
 * `DEFAULT_PROVIDER_KIND` — the first available processing provider, your own
 * video — and a preset re-seeds it at that kind.
 *
 * Top to bottom, lifted from the real components: `StepIndicator` at that
 * index; `PinnedLineBar`'s 36px strip when pinned; `WizardShell`'s column at
 * `pt-16 pb-24` with the "Step N of M" eyebrow, the step's title and lede as
 * real text from `STEP_CONFIG` (through `stepHeading`, so the video override
 * applies exactly as it does on the page); the step body at `mt-[52px]`; then
 * the shell's sticky 64px hairline-topped footer — Cancel (both routes open
 * on their first step, so no Back), the spacer, Save draft, the primary.
 *
 * `pulse={false}`: the known chrome holds still and each bar pulses by
 * itself. Nothing is focusable — a Continue that can be tabbed to lies.
 */

/** `DEFAULT_PROVIDER_KIND` — see above. */
const KIND = "processing" as const;

export function UploadWizardPending({ pinned }: { pinned: boolean }) {
  const step: Step = pinned ? "file" : "provider";
  const order = STEP_ORDER_BY_KIND[KIND];
  const index = order.indexOf(step);
  const { title, description } = stepHeading({
    step,
    isProcessingProvider: true,
    // A preset rewrites only the match step's heading.
    line: null,
    subjectFirstName: null,
  });

  return (
    <PendingFrame label="upload wizard" pulse={false}>
      <div className="flex min-h-[calc(100vh-44px)] flex-col">
        <StepIndicator currentStep={index} totalSteps={order.length} />

        {pinned && <PinnedLinePending />}

        <div className={`${CONTENT_CLS} pt-16 pb-24`}>
          <div className="flex flex-col gap-3">
            <span className="eyebrow-sm" style={{ color: "var(--ink-400)" }}>
              Step {index + 1} of {order.length}
            </span>
            <h1
              className="max-w-[560px] text-[30px] leading-[1.15] font-light tracking-[-0.3px] text-[var(--ink-900)]"
              style={{ textWrap: "pretty" }}
            >
              {title}
            </h1>
            <p
              className="max-w-[480px] text-[13px] leading-[1.55] text-[var(--ink-600)]"
              style={{ textWrap: "pretty" }}
            >
              {description}
            </p>
          </div>

          <div className="mt-[52px]">
            {step === "file" ? <FileStepBody /> : <ProviderStepBody />}
          </div>
        </div>

        {/* WizardShell's footer: Cancel · spacer · Save draft · primary */}
        <div className="sticky bottom-0 z-10 mt-auto border-t border-[var(--border-hairline)] bg-white">
          <div className={`${CONTENT_CLS} flex h-16 items-center gap-4`}>
            <PendingBar className="h-3 w-10" />
            <div className="flex-1" />
            <PendingBar className="h-2.5 w-14" />
            <PendingBar className="h-9 w-[92px] rounded-[6px]" />
          </div>
        </div>
      </div>
    </PendingFrame>
  );
}

/** An eyebrow's line, as a bar: 10px caps sit in a 12px line. */
function EyebrowBar({ className }: { className: string }) {
  return (
    <span className="flex h-3 items-center">
      <PendingBar className={cn("h-2", className)} />
    </span>
  );
}

/**
 * `SourceStepContent`: Workspace · For · Source, 36px apart. Each `Field` is
 * an eyebrow over a 40px row on a hairline — the lead mark, the 20px value
 * and 16px subline, Source's mono file types and chevron. Every rule is the
 * resting hairline: which field carries the blue one depends on the
 * workspace kind, and a skeleton does not claim a field is being worked.
 */
function ProviderStepBody() {
  const fields = [
    {
      eyebrow: "w-[76px]",
      lead: "rounded-[var(--radius-button)]",
      value: "w-40",
      sub: "w-56",
    },
    { eyebrow: "w-7", lead: "rounded-full", value: "w-36", sub: "w-72" },
    {
      eyebrow: "w-12",
      lead: "rounded-[var(--radius-button)]",
      value: "w-44",
      sub: "w-80",
      source: true,
    },
  ];
  return (
    <div className="flex flex-col gap-9">
      {fields.map((field) => (
        <div key={field.eyebrow} className="flex flex-col gap-[14px]">
          <EyebrowBar className={field.eyebrow} />
          <div className="flex items-center gap-4 pb-4 shadow-[inset_0_-1px_0_var(--border-hairline)]">
            <PendingBar className={cn("size-10 shrink-0", field.lead)} />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex h-5 items-center">
                <PendingBar className={cn("h-3.5", field.value)} />
              </span>
              <span className="flex h-4 items-center">
                <PendingBar className={cn("h-2.5", field.sub)} />
              </span>
            </span>
            {field.source && (
              <>
                <PendingBar className="h-2.5 w-16" />
                <ChevronDown
                  className="size-[13px] shrink-0 text-[var(--ink-400)]"
                  strokeWidth={1.5}
                />
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * `FileStepContent` with no file yet, video kind: the 280px dashed drop zone
 * (its film glyph always drawn; the two lines name whose video, so bars), then
 * `VideoRequirements` — eyebrow, the spec line, four icon rows, the link.
 * The zone's bars take `--ink-200`: the skeleton token vanishes on its
 * `--surface-page` ground.
 */
function FileStepBody() {
  return (
    <div className="flex flex-col gap-9">
      <div className="flex h-[280px] flex-col items-center justify-center gap-3.5 rounded-[var(--radius-card)] border border-dashed border-[var(--border-medium)] bg-[var(--surface-page)]">
        <Film className="size-7 text-[var(--ink-300)]" strokeWidth={1.5} />
        <span className="flex flex-col items-center gap-1.5">
          <span className="flex h-5 items-center">
            <PendingBar className="h-3 w-60 bg-[var(--ink-200)]" />
          </span>
          <span className="flex h-4 items-center">
            <PendingBar className="h-2.5 w-52 bg-[var(--ink-200)]" />
          </span>
        </span>
      </div>

      <div className="flex flex-col gap-3.5">
        <EyebrowBar className="w-44" />
        <span className="flex h-[18px] items-center">
          <PendingBar className="h-2.5 w-80" />
        </span>
        <div className="flex flex-col gap-2.5">
          {["w-[88%]", "w-full", "w-[80%]", "w-[84%]"].map((width) => (
            <div key={width} className="flex items-start gap-3">
              <PendingBar className="mt-0.5 size-[13px] shrink-0" />
              <span className="flex h-[18px] flex-1 items-center">
                <PendingBar className={cn("h-2.5", width)} />
              </span>
            </div>
          ))}
        </div>
        <span className="flex h-[18px] items-center">
          <PendingBar className="h-2.5 w-32" />
        </span>
      </div>
    </div>
  );
}
