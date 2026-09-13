/**
 * VideoRequirements — the "what the analysis needs" panel under the file
 * step's drop zone, for the Advantage Intelligence (video) path only.
 *
 * Deliberately NOT `"use client"`. It holds no state, no effects, no handlers
 * and touches no browser global — it is a spec line, four rows of copy, and a
 * link to the help centre. Its only caller, `FileStepContent`, is already a
 * client component, so the directive marked a boundary that was not there and
 * bought nothing; without it this panel can also be rendered from a Server
 * Component if the guidance is ever wanted somewhere outside the wizard.
 *
 * Split out of `FileStepContent.tsx` to keep that file bounded — this block
 * grew from three quiet bullets into a spec line and four requirement rows
 * once 03_plan Plan 17 asked for the provider's actual numbers instead of
 * vague prose. It renders before a file is chosen (and stays visible after,
 * since the trim step still has to honour the same framing) — see
 * `FileStepContent`'s render order, which keeps this below the drop zone's
 * own error/progress states rather than covering them.
 *
 * Every number and claim below is the provider's own, checked against
 * https://splitstep.ai/api-docs.html (Video Guidelines / error codes) on
 * 2026-09-10 — see `work/upload-flow-refinements/01_brief/output/brief.md`
 * §"Also consulted" and `02_design/output/design.md`'s Video requirements
 * section. This panel deliberately does not give a measured outside-court
 * margin — the guide never gave one, so a figure here would be invented, not
 * sourced. Nothing on this page inspects pixels; a person still has to look
 * at the shot before recording. Aligning `useUploadMatchWizard`'s
 * probe/validator thresholds to this copy is a separate, later task — this
 * component only presents guidance. The "View all requirements" link points
 * to `/dashboard/help#advantage-intelligence`, the help centre's Advantage
 * Intelligence section (`src/app/dashboard/help/page.tsx`) — that section
 * does not cover camera framing, which is why the framing rule stays in the
 * "Elevated, centered, behind one baseline" row below rather than moving
 * there.
 */

import Link from "next/link";
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
    rest: " — both baselines and the far service line in frame, with some space beyond the court on every side.",
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

      <Link
        href="/dashboard/help#advantage-intelligence"
        className="text-[12px] text-[var(--blue)] hover:text-[var(--blue-hover)]"
      >
        View all requirements
      </Link>
    </div>
  );
}
