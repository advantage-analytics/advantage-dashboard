"use client";

import { useState } from "react";
import { TourPopover } from "@/components/ui/tour";
import { advButton } from "@/lib/ui/adv-button";

const STEPS: readonly { target: string; title: string; body: string }[] = [
  {
    target: "Upload",
    title: "Add a match",
    body: "Upload match video or a SwingVision export. Analysis starts on its own.",
  },
  {
    target: "Matches",
    title: "Every match, one list",
    body: "Open a row for its report: serve, return, rallies and the film.",
  },
  {
    target: "Settings",
    title: "Make it yours",
    body: "Your profile, recording source and notifications live here.",
  },
];

/**
 * The tour popover over three fixed targets. Start it, then Next through the
 * steps with the mouse or Enter; Escape or Skip ends it and focus returns to
 * the Start button.
 */
export function TourPreview() {
  const [targets, setTargets] = useState<(HTMLElement | null)[]>([
    null,
    null,
    null,
  ]);
  const [step, setStep] = useState<number | null>(null);

  // One stable callback ref per target: a fresh function every render would
  // detach and reattach each element, and every reattach is a state change.
  const [targetRefs] = useState(() =>
    STEPS.map(
      (_, i) => (el: HTMLElement | null) =>
        setTargets((prev) => {
          if (prev[i] === el) return prev;
          const next = prev.slice();
          next[i] = el;
          return next;
        }),
    ),
  );

  const current = step === null ? null : STEPS[step];

  return (
    <section id="tour" className="mt-16">
      <h2 className="text-[14px] font-medium text-[var(--ink-900)]">
        Tour popover
      </h2>
      <p className="mt-1 max-w-[60ch] text-[12px] leading-[1.6] text-[var(--ink-600)]">
        One step of a first-run tour, pinned to an element on the page. Three
        steps over fixed targets; Escape or Skip ends it and focus returns to
        where it started.
      </p>
      <div className="mt-5">
        <button
          type="button"
          onClick={() => setStep(0)}
          className={advButton("outline", "sm")}
        >
          Start tour
        </button>
      </div>
      <div className="mt-6 flex max-w-[720px] flex-wrap gap-6 rounded-[10px] border border-[var(--border-card)] bg-[var(--surface-card)] p-6 pb-48">
        {STEPS.map((s, i) => (
          <div
            key={s.target}
            ref={targetRefs[i]}
            className="rounded-[8px] border border-[var(--border-field)] px-3 py-2 text-[12px] text-[var(--ink-700)]"
          >
            {s.target}
          </div>
        ))}
      </div>

      {current && step !== null ? (
        <TourPopover
          open
          anchor={targets[step]}
          index={step}
          total={STEPS.length}
          title={current.title}
          body={current.body}
          onNext={() =>
            setStep((s) => (s === null || s >= STEPS.length - 1 ? null : s + 1))
          }
          onSkip={() => setStep(null)}
        />
      ) : null}
    </section>
  );
}
