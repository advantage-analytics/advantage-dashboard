import type { AskSourceMatch, AskVisual } from "@/lib/services/ask/events";
import { BarsVisual } from "./bars-visual";
import { FormVisual } from "./form-visual";
import { MomentumVisual } from "./momentum-visual";
import { ServeVisual } from "./serve-visual";
import { SplitVisual } from "./split-visual";
import { TableVisual } from "./table-visual";
import { TreeVisual } from "./tree-visual";
import { TrendVisual } from "./trend-visual";

/**
 * The one visual block an Ask answer may carry, drawn by its `kind`.
 *
 * Every block prints the server's `text` and uses `value` for geometry only
 * (`visual-geometry.ts`): no database value is formatted here. Colour is
 * role — `--viz-you*` for the player's series, `--viz-opp*` for a baseline,
 * and the outcome colours in the form strip alone.
 *
 * `sources` are the matches the answer was computed from: over exactly one,
 * a bar, a table row, a serve zone or a tree branch that names a measure or
 * a pattern is a link to that match's film on those points
 * (`figure-video.ts`), as the figure tiles are. A table row or a form tick
 * that is one match links to it whatever the scope.
 *
 * Hand-drawn divs and SVG, no chart library, and nothing here may import
 * `next/navigation` or `next/image`: the blocks render inside `AskAnswer`,
 * which an offline harness bundles (`tests/ask-answer-view.spec.ts`).
 */
export function AskVisualBlock({
  visual,
  sources,
  trendAverageLabel,
}: {
  visual: AskVisual;
  sources?: readonly AskSourceMatch[] | null;
  /**
   * The trend block's key for its dashed mean: "Your average" on the personal
   * page, "Average" on the team one, where the series may be any player's.
   * The block's own default when omitted.
   */
  trendAverageLabel?: string;
}) {
  switch (visual.kind) {
    case "bars":
      return <BarsVisual visual={visual} sources={sources} />;
    case "table":
      return <TableVisual visual={visual} sources={sources} />;
    case "trend":
      return <TrendVisual visual={visual} averageLabel={trendAverageLabel} />;
    case "split":
      return <SplitVisual visual={visual} />;
    case "serve":
      return <ServeVisual visual={visual} sources={sources} />;
    case "form":
      return <FormVisual visual={visual} />;
    case "momentum":
      return <MomentumVisual visual={visual} />;
    case "tree":
      return <TreeVisual visual={visual} sources={sources} />;
    default:
      // A kind this build does not know: `readAskVisual` refuses it before
      // it gets here, and a block that cannot be drawn is not drawn.
      return null;
  }
}
