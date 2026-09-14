"use client";

import { useEffect, useRef } from "react";
import { CircleAlert } from "lucide-react";

/**
 * The error a dialog shows, in the shape the rest of the app uses — led by a
 * 13px `CircleAlert` at stroke 1.5, nudged to the first line, so a refusal
 * reads as one at a glance (the notice-strip glyph size, `primitives.md`).
 *
 * It sits at the foot of the dialog body, which scrolls once a form is taller
 * than the window (Edit Match is). A refused Save from the top of the form
 * would otherwise show nothing on screen and read as a dead button, so each
 * new message scrolls itself into view — smoothly, unless reduced motion.
 *
 * Shared by `RosterDialog` and `ConfirmDialog`; it lives in `ui/` so the
 * confirm primitive never imports from `dashboard/`.
 */
export function DialogProblem({ message }: { message: string | null }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!message || !ref.current) return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    ref.current.scrollIntoView({
      block: "nearest",
      behavior: reduce ? "auto" : "smooth",
    });
  }, [message]);
  if (!message) return null;
  return (
    <p
      ref={ref}
      role="alert"
      className="flex items-start gap-2 rounded-[var(--radius-button)] px-3 py-2 text-[12px] text-[var(--danger)]"
      style={{ background: "var(--danger-tint, rgba(229,24,55,0.08))" }}
    >
      <CircleAlert
        className="mt-[2.5px] size-[13px] shrink-0"
        strokeWidth={1.5}
        aria-hidden
      />
      <span>{message}</span>
    </p>
  );
}
