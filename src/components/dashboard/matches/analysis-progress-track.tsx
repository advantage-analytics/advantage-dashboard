/**
 * One progress track, used everywhere a job's progress is drawn.
 *
 * The matches list and the match page each had their own bar — different
 * heights, different markup, and for a while different numbers, because only one
 * of them was wired for live updates. Two components expressing one state is how
 * that drift happened, so there is now one.
 *
 * `live` is the part that matters. The percentage behind this comes from a
 * heartbeat written at most every 2 points, so a genuinely-moving upload sits on
 * the same number for a minute at a time and looks identical to a dead one. The
 * sheen is what distinguishes them.
 */

interface AnalysisProgressTrackProps {
  /** 0-100. Clamped, so a bad value cannot overflow the track. */
  percent: number;
  /** Work is in flight right now. Drives the travelling sheen. */
  live?: boolean;
  /** Fill colour. Defaults to the action accent; failures pass the loss red. */
  tone?: string;
  /** Announced to screen readers. Omit for decorative stage segments. */
  label?: string;
}

export function AnalysisProgressTrack({
  percent,
  live = false,
  tone = "#3B82F6",
  label,
}: AnalysisProgressTrackProps): React.JSX.Element {
  const value = Math.max(0, Math.min(100, percent));

  return (
    <div
      className="h-[3px] overflow-hidden rounded-full bg-[#F0F0F0]"
      {...(label
        ? {
            role: "progressbar",
            "aria-label": label,
            "aria-valuenow": Math.round(value),
            "aria-valuemin": 0,
            "aria-valuemax": 100,
          }
        : { "aria-hidden": true })}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] ${
          live ? "progress-fill-live" : ""
        }`}
        style={{ width: `${value}%`, backgroundColor: tone }}
      />
    </div>
  );
}
