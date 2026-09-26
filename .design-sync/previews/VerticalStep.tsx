import { VerticalStep } from "advantage-analytics-ds";

const bar = (pct: number) => (
  <div
    style={{
      height: 3,
      borderRadius: 2,
      background: "var(--ink-100)",
      overflow: "hidden",
      maxWidth: 320,
    }}
  >
    <div
      style={{ height: "100%", width: `${pct}%`, background: "var(--blue)" }}
    />
  </div>
);

/** A vertical progress stepper: done, running now, not started — inside an `<ol aria-label="Progress">`. */
export function Progress() {
  return (
    <ol
      aria-label="Progress"
      style={{ listStyle: "none", margin: 0, padding: 0, maxWidth: 380 }}
    >
      <VerticalStep
        label="Video uploaded"
        state="done"
        value="1.2 GB"
        last={false}
      />
      <VerticalStep
        label="Analyzing serves and rallies"
        state="now"
        value="62%"
        last={false}
      >
        {bar(62)}
      </VerticalStep>
      <VerticalStep label="Statistics ready" state="later" last={false} />
      <VerticalStep label="Film trimmed" state="later" last />
    </ol>
  );
}

/** A failed step keeps its place in the list, with a body for the retry. */
export function Failed() {
  return (
    <ol
      aria-label="Progress"
      style={{ listStyle: "none", margin: 0, padding: 0, maxWidth: 380 }}
    >
      <VerticalStep
        label="Video uploaded"
        state="done"
        value="1.2 GB"
        last={false}
      />
      <VerticalStep label="Analysis failed" state="fail" last>
        <span style={{ fontSize: 12, color: "var(--ink-600)" }}>
          The vendor could not find a court in the first ten minutes. Trim the
          warm-up and try again.
        </span>
      </VerticalStep>
    </ol>
  );
}
