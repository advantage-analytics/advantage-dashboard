/**
 * VideoRequirements — the "what the analysis needs" panel under the file
 * step's drop zone, for the Advantage Intelligence (video) path only.
 *
 * Deliberately NOT `"use client"`. It holds no state, no effects, no handlers
 * and touches no browser global — it is a spec line, an inline SVG and four
 * rows of copy. Its only caller, `FileStepContent`, is already a client
 * component, so the directive marked a boundary that was not there and bought
 * nothing; without it this panel can also be rendered from a Server Component
 * if the guidance is ever wanted somewhere outside the wizard.
 *
 * Split out of `FileStepContent.tsx` to keep that file bounded — this block
 * grew from three quiet bullets into a spec line, a court-framing guide, and
 * four requirement rows once 03_plan Plan 17 asked for the provider's actual
 * numbers instead of vague prose. It renders before a file is chosen (and
 * stays visible after, since the trim step still has to honour the same
 * framing) — see `FileStepContent`'s render order, which keeps this below
 * the drop zone's own error/progress states rather than covering them.
 *
 * Every number and claim below is the provider's own, checked against
 * https://splitstep.ai/api-docs.html (Video Guidelines / error codes) on
 * 2026-09-10 — see `work/upload-flow-refinements/01_brief/output/brief.md`
 * §"Also consulted" and `02_design/output/design.md`'s Video requirements
 * section. Two things this panel deliberately does not say: a measured
 * outside-court margin (the guide never gave one — a figure here would be
 * invented, not sourced) and any claim that this screen checked the framing.
 * Nothing on this page inspects pixels; a person still has to look at the
 * shot before recording. Aligning `useUploadMatchWizard`'s probe/validator
 * thresholds to this copy is a separate, later task — this component only
 * presents guidance.
 */

import { HardDrive, Scan, User, Video } from "lucide-react";

interface Requirement {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  lead: string;
  rest: string;
}

const REQUIREMENTS: readonly Requirement[] = [
  {
    icon: Video,
    lead: "One camera, one position",
    rest: " — a tripod or a phone against the fence. Following the play breaks the court mapping.",
  },
  {
    icon: Scan,
    lead: "Elevated, centered, behind one baseline",
    rest: " — see the court guide below for what has to stay in frame.",
  },
  {
    icon: User,
    lead: "Singles, complete games",
    rest: " — the window you trim to has to match the score you enter in step 4.",
  },
  {
    icon: HardDrive,
    lead: "Under 8 GB, MP4/H.264 works best",
    rest: ", though Advantage Intelligence accepts most formats a camera or phone can produce.",
  },
];

/**
 * A schematic, not a scale drawing. The dashed outer edge is the space
 * outside the court a frame should still show — no distance is claimed for
 * it, because the provider's guidance never measured one. The two heavy
 * lines are both baselines; the lighter inner line is the far service line.
 */
function CourtGuide() {
  return (
    <div className="flex items-center gap-3.5 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-3.5 py-3">
      <svg
        viewBox="0 0 120 84"
        className="h-14 w-20 shrink-0"
        role="img"
        aria-label="Court guide: both baselines, the far service line, and some space beyond the court all visible in frame"
      >
        <rect
          x="4"
          y="4"
          width="112"
          height="76"
          rx="3"
          fill="none"
          stroke="var(--border-medium)"
          strokeWidth="1.5"
          strokeDasharray="3 3"
        />
        <line
          x1="24"
          y1="14"
          x2="96"
          y2="14"
          stroke="var(--ink-700)"
          strokeWidth="1.5"
        />
        <line
          x1="24"
          y1="70"
          x2="96"
          y2="70"
          stroke="var(--ink-700)"
          strokeWidth="1.5"
        />
        <line
          x1="24"
          y1="14"
          x2="24"
          y2="70"
          stroke="var(--ink-300)"
          strokeWidth="1"
        />
        <line
          x1="96"
          y1="14"
          x2="96"
          y2="70"
          stroke="var(--ink-300)"
          strokeWidth="1"
        />
        <line
          x1="24"
          y1="30"
          x2="96"
          y2="30"
          stroke="var(--ink-400)"
          strokeWidth="1.5"
        />
      </svg>
      <div className="flex flex-col gap-1">
        <span className="text-[12px] leading-[1.5] text-[var(--ink-700)]">
          <b className="font-medium text-[var(--ink-900)]">Both baselines</b>{" "}
          and the{" "}
          <b className="font-medium text-[var(--ink-900)]">far service line</b>{" "}
          in frame, with some{" "}
          <b className="font-medium text-[var(--ink-900)]">
            space beyond the court
          </b>{" "}
          on every side.
        </span>
        <span className="text-micro">
          A guide, not a check — nothing here confirms the framing.
        </span>
      </div>
    </div>
  );
}

export function VideoRequirements() {
  return (
    <div className="flex flex-col gap-3.5">
      <span className="eyebrow">What the analysis needs</span>

      <span className="text-[12px] leading-[1.5] text-[var(--ink-700)]">
        <b className="font-medium text-[var(--ink-900)]">1080p minimum</b>
        {" · "}
        <b className="font-medium text-[var(--ink-900)]">30 fps minimum</b>
        {" (29.97 fps accepted) · "}
        <b className="font-medium text-[var(--ink-900)]">60 fps preferred</b>
      </span>

      <CourtGuide />

      <div className="flex flex-col gap-2.5">
        {REQUIREMENTS.map(({ icon: Icon, lead, rest }) => (
          <div key={lead} className="flex items-start gap-3">
            <Icon
              className="mt-0.5 size-[13px] shrink-0 text-[var(--ink-400)]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span className="text-[12px] leading-[1.5] text-[var(--ink-700)]">
              <b className="font-medium text-[var(--ink-900)]">{lead}</b>
              {rest}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
