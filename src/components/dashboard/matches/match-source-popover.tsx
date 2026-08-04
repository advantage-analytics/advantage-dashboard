"use client";

/**
 * "Where did this analysis come from" — the ⓘ beside a match name.
 *
 * This is what a separate job-detail page would otherwise have carried: source,
 * video, billable window, job reference, current stage. Keeping it in a popover
 * means the queue never becomes a second place a match lives.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";
import {
  ANALYSIS_LABEL,
  isInFlight,
  type MatchAnalysis,
} from "@/lib/data/match-analysis";

/** Tallest the panel gets plus breathing room, used to decide drop direction. */
const PANEL_CLEARANCE_PX = 260;

interface MatchSourcePopoverProps {
  analysis: MatchAnalysis;
  matchLabel: string;
}

export function MatchSourcePopover({
  analysis,
  matchLabel,
}: MatchSourcePopoverProps): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  /**
   * Rows near the fold would otherwise open a panel that runs off the viewport.
   * Measured on the click rather than in an effect so the panel is placed on its
   * very first paint — flipping afterwards reads as a glitch.
   */
  const toggle = useCallback(() => {
    if (!open) {
      const rect = triggerRef.current?.getBoundingClientRect();
      const spaceBelow = window.innerHeight - (rect?.bottom ?? 0);
      setDropUp(spaceBelow < PANEL_CLEARANCE_PX);
    }
    setOpen(!open);
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, close]);

  // A hand-scored match has no source to explain, so it gets no affordance.
  if (!analysis.providerId) return null;

  const isOurEngine = analysis.providerId === "splitstep";
  const percent = analysis.progressPercent;

  const facts: { label: string; value: string; ink?: string }[] = [];
  if (isOurEngine) {
    if (analysis.fileName) facts.push({ label: "Video", value: analysis.fileName });
    if (analysis.window) facts.push({ label: "Window", value: analysis.window });
    if (analysis.jobReference) facts.push({ label: "Job", value: analysis.jobReference });
    if (analysis.stageNote) facts.push({ label: "Stage", value: analysis.stageNote });
    if (analysis.failNote) facts.push({ label: "Stopped", value: analysis.failNote });
  } else {
    if (analysis.window) facts.push({ label: "Window", value: analysis.window });
    if (analysis.jobReference) facts.push({ label: "Job", value: analysis.jobReference });
    facts.push({
      label: "Result",
      value: analysis.verified ? "Verified" : "Unverified",
      ink: analysis.verified ? "#3B82F6" : "#888888",
    });
  }

  return (
    <span className="relative flex-none" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`Analysis source for ${matchLabel}`}
        className="relative z-10 flex items-center rounded-full text-[#D9D9D9] transition-opacity duration-200 hover:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
      >
        <Info className="size-[11px]" strokeWidth={1.75} aria-hidden="true" />
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={`Analysis source for ${matchLabel}`}
          style={{ width: isOurEngine ? 270 : 262, padding: "15px 17px 16px" }}
          className={`absolute left-0 z-30 cursor-default rounded-xl border border-[#E5E5EA] bg-white text-left shadow-[0_8px_30px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)] ${
            dropUp ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          <div className="mb-3.5 flex items-center justify-between gap-3 border-b border-[#F3F3F3] pb-[13px]">
            {isOurEngine ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/logos/logo4.svg" alt="Advantage" className="h-[17px] w-auto" />
            ) : (
              /* The mark sits inside a 1120×560 field of whitespace, so it is
                 windowed rather than scaled — at a natural fit the glyph would
                 render around 6px tall. Offsets are proportional to that asset. */
              <span className="relative block h-7 w-[100px] flex-none overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/providers/swingvision.png"
                  alt="SwingVision"
                  className="absolute max-w-none"
                  style={{ left: -29.5, top: -25.8, width: 161, height: 80.5 }}
                />
              </span>
            )}
            <span
              className="shrink-0 text-[9px] font-medium uppercase tracking-[1.8px]"
              style={{ color: isOurEngine ? "#3B82F6" : "#AAAAAA" }}
            >
              {isOurEngine ? "Intelligence" : "Imported"}
            </span>
          </div>

          <dl className="flex flex-col gap-[9px]">
            {facts.map((fact) => (
              <div key={fact.label} className="flex items-center justify-between gap-3">
                <dt className="shrink-0 text-[11px] text-[#888888]">{fact.label}</dt>
                <dd
                  className="min-w-0 truncate text-[11px] tabular-nums"
                  style={{ color: fact.ink ?? "#0D0D0D" }}
                >
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>

          {isOurEngine && percent !== undefined && (
            <div className="mt-[13px] flex flex-col gap-1.5">
              <div className="h-[2px] overflow-hidden rounded-full bg-[#F0F0F0]">
                <div
                  className="h-full rounded-full bg-[#3B82F6] transition-[width] duration-700 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <div className="flex items-baseline justify-between gap-2.5">
                <span className="whitespace-nowrap text-[11px] font-medium text-[#3B82F6]">
                  {ANALYSIS_LABEL[analysis.status]}
                </span>
                <span className="whitespace-nowrap text-[11px] font-medium text-[#3B82F6] tabular-nums">
                  {Math.round(percent)}%
                </span>
              </div>
            </div>
          )}

          {/* Inert in the design too — these are plain spans there, with no
              handler bound and no job-record route to reach. */}
          <div
            className={`flex items-center justify-between gap-3 border-t border-[#F3F3F3] pt-[13px] ${
              isOurEngine ? "mt-[13px]" : "mt-3.5"
            }`}
          >
            <span className="text-[11px] font-medium text-[#3B82F6]">Open job record</span>
            {isOurEngine && isInFlight(analysis.status) && (
              <span className="text-[11px] text-[#888888]">Cancel</span>
            )}
          </div>
        </div>
      )}
    </span>
  );
}
