import type { AskVisual } from "@/lib/services/ask/events";
import { BarsVisual } from "./bars-visual";
import { FormVisual } from "./form-visual";
import { MomentumVisual } from "./momentum-visual";
import { ServeVisual } from "./serve-visual";
import { SplitVisual } from "./split-visual";
import { TableVisual } from "./table-visual";
import { TrendVisual } from "./trend-visual";

/**
 * The one visual block an Ask answer may carry, drawn by its `kind`.
 *
 * Every block prints the server's `text` and uses `value` for geometry only
 * (`visual-geometry.ts`): no database value is formatted here. Colour is
 * role — `--viz-you*` for the player's series, `--viz-opp*` for a baseline,
 * and the outcome colours in the form strip alone.
 *
 * Hand-drawn divs and SVG, no chart library, and nothing here may import
 * `next/navigation` or `next/image`: the blocks render inside `AskAnswer`,
 * which an offline harness bundles (`tests/ask-answer-view.spec.ts`).
 */
export function AskVisualBlock({
  visual,
  trendAverageLabel,
}: {
  visual: AskVisual;
  /**
   * The trend block's key for its dashed mean: "Your average" on the personal
   * page, "Average" on the team one, where the series may be any player's.
   * The block's own default when omitted.
   */
  trendAverageLabel?: string;
}) {
  switch (visual.kind) {
    case "bars":
      return <BarsVisual visual={visual} />;
    case "table":
      return <TableVisual visual={visual} />;
    case "trend":
      return <TrendVisual visual={visual} averageLabel={trendAverageLabel} />;
    case "split":
      return <SplitVisual visual={visual} />;
    case "serve":
      return <ServeVisual visual={visual} />;
    case "form":
      return <FormVisual visual={visual} />;
    case "momentum":
      return <MomentumVisual visual={visual} />;
    default:
      // A kind this build does not know: `readAskVisual` refuses it before
      // it gets here, and a block that cannot be drawn is not drawn.
      return null;
  }
}
