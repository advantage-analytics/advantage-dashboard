/**
 * CourtFrame — what the camera's frame looks like, as a 16:9 diagram.
 *
 * Two frames, both drawn from a pinhole projection of a real court rather
 * than by eye, so the thing each one shows is true:
 *
 * - `works`: raised, behind the back fence. The far service line (blue)
 *   clears the top of the net and the space behind the near baseline (dashed)
 *   is inside the frame — the two things the court mapping needs.
 * - `wont-work`: low and close. The net stands in front of the far service
 *   line and the near baseline runs out of the bottom of the frame.
 *
 * Not `"use client"`: no state, no handlers. `VideoRequirements` renders it
 * from a module that has to stay server-renderable.
 *
 * The far service line is a filled quad drawn BEFORE the white lines, with its
 * ends cut along the singles sidelines — it is a court line that happens to be
 * blue, not a bar laid over the court. The centre service line starts at its
 * lower edge so white never crosses it.
 */

const LINE = {
  fill: "none",
  stroke: "var(--surface-card)",
  strokeWidth: 1,
  strokeLinejoin: "round",
  vectorEffect: "non-scaling-stroke",
} as const;

const POST = {
  fill: "none",
  stroke: "var(--ink-600)",
  strokeWidth: 1,
  vectorEffect: "non-scaling-stroke",
} as const;

const LABEL = {
  works:
    "From behind the back fence: the far service line shows above the net, and the space behind the near baseline is inside the frame",
  "wont-work":
    "Filmed low and close: the net hides the far service line, and the near baseline is below the frame",
} as const;

export function CourtFrame({
  variant,
  className,
}: {
  variant: "works" | "wont-work";
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 320 180"
      role="img"
      aria-label={LABEL[variant]}
      className={className}
    >
      <rect width="320" height="180" fill="var(--surface-subtle)" />
      {variant === "works" ? (
        <>
          <polygon
            points="114.1,40 205.9,40 270,138 50,138"
            fill="var(--viz-court-fill)"
          />
          <polygon
            points="120.5,50.4 199.5,50.4 200,51.4 120,51.4"
            fill="var(--blue)"
          />
          <path
            d="M114.1 40H205.9L270 138H50ZM125.6 40 77.5 138M194.4 40 242.5 138M97.6 97H222.4M160 51.4V97M160 138v-3.5"
            {...LINE}
          />
          <polygon
            points="84.5,69.2 235.5,69.2 235.5,56.2 160,58 84.5,56.2"
            fill="var(--ink-900)"
            fillOpacity={0.12}
          />
          <path d="M84.5 56.2 160 58 235.5 56.2" {...LINE} />
          <path d="M84.5 55.7V70M235.5 55.7V70" {...POST} />
          <polygon
            points="50,138 270,138 292.2,172 27.8,172"
            fill="none"
            stroke="var(--blue)"
            strokeWidth={1}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        </>
      ) : (
        <>
          <polygon
            points="120.8,54.3 199.2,54.3 639.8,215 -319.8,215"
            fill="var(--viz-court-fill)"
          />
          <path
            d="M120.8 54.3H199.2L639.8 215M120.8 54.3-319.8 215M130.6 54.3-200 215M189.4 54.3 520 215M122.7 58.1H197.3M59.8 88.7H260.2M160 58.1V88.7"
            {...LINE}
          />
          <polygon
            points="75.4,66.8 244.6,66.8 244.6,52.3 160,54.3 75.4,52.3"
            fill="var(--ink-300)"
          />
          <path d="M75.4 52.3 160 54.3 244.6 52.3" {...LINE} />
          <path d="M75.4 51.8V67.6M244.6 51.8V67.6" {...POST} />
        </>
      )}
    </svg>
  );
}
