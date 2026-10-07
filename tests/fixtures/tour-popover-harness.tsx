import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { TourPopover } from "@/components/ui/tour";

/**
 * T4: `TourPopover` in a real browser, over anchors that live OUTSIDE React's
 * tree and are found by `[data-tour="…"]` — the way the runner will find them.
 *
 * The first anchor is itself the "Start tour" button, so the element focused
 * when the tour opens is an anchor, and the spec can assert focus comes back
 * to it. Every `onSkip` bumps `data-skipped` on <html>, so the spec can tell
 * Escape went through `onSkip` rather than some other close path.
 */

const STEPS = [
  { tour: "upload", title: "Add a match", body: "Upload video or an export." },
  { tour: "matches", title: "Every match", body: "Open a row for its report." },
  { tour: "settings", title: "Make it yours", body: "Profile and sources." },
];

document.body.insertAdjacentHTML(
  "afterbegin",
  `<div style="display:flex;gap:24px;padding:24px">
    <button type="button" data-tour="upload">Start tour</button>
    <button type="button" data-tour="matches">Matches</button>
    <button type="button" data-tour="settings">Settings</button>
  </div>`,
);

const anchorFor = (tour: string) =>
  document.querySelector<HTMLElement>(`[data-tour="${tour}"]`);

let skipped = 0;
document.documentElement.dataset.skipped = "0";

function Harness() {
  const [step, setStep] = useState<number | null>(null);

  // Not a React listener: the start button is outside the tree. The page
  // reports itself hydrated only once the listener is attached.
  useEffect(() => {
    const button = anchorFor("upload");
    const start = () => setStep(0);
    button?.addEventListener("click", start);
    document.documentElement.dataset.hydrated = "true";
    return () => button?.removeEventListener("click", start);
  }, []);

  if (step === null) return null;
  const current = STEPS[step];
  return (
    <TourPopover
      open
      anchor={anchorFor(current.tour)}
      index={step}
      total={STEPS.length}
      title={current.title}
      body={current.body}
      onNext={() =>
        setStep((s) => (s === null || s >= STEPS.length - 1 ? null : s + 1))
      }
      onSkip={() => {
        skipped += 1;
        document.documentElement.dataset.skipped = String(skipped);
        setStep(null);
      }}
    />
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
