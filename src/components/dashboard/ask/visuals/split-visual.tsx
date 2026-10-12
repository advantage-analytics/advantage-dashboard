import type { AskSplitVisual } from "@/lib/services/ask/events";
import { shareWeights } from "./visual-geometry";
import { VisualFrame } from "./visual-frame";

/** Two to four parts: the three blue steps, then slate for a fourth. */
const STEPS = [
  "var(--viz-you)",
  "var(--viz-you-mid)",
  "var(--viz-you-light)",
  "var(--viz-opp-light)",
];

/**
 * Parts of a whole: one bar cut by each part's count, and the counts under
 * it. Each part prints its own count and nothing derived from it — a share
 * of the whole is not a cell of the query result.
 */
export function SplitVisual({ visual }: { visual: AskSplitVisual }) {
  const weights = shareWeights(visual.parts.map((part) => part.count.value));

  return (
    <VisualFrame kind="split" caption={visual.caption}>
      <span aria-hidden="true" className="flex h-3.5 gap-0.5">
        {weights ? (
          weights.map(
            (weight, index) =>
              weight > 0 && (
                <span
                  key={index}
                  className="h-full min-w-0 rounded-[var(--radius-cell)]"
                  style={{
                    flexGrow: weight,
                    flexBasis: 0,
                    background: STEPS[index % STEPS.length],
                  }}
                />
              ),
          )
        ) : (
          // Nothing to divide: the track, holding no parts.
          <span className="h-full flex-1 rounded-[var(--radius-cell)] bg-[var(--ink-100)]" />
        )}
      </span>
      <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0">
        {visual.parts.map((part, index) => (
          <li key={index} className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-[11px] text-[var(--ink-600)]">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-[2px]"
                style={{ background: STEPS[index % STEPS.length] }}
              />
              {part.label}
            </span>
            <span className="text-[13px] text-[var(--ink-900)] tabular-nums">
              {part.count.text}
            </span>
          </li>
        ))}
      </ul>
    </VisualFrame>
  );
}
