import { StepMark } from "advantage-analytics-ds";

const lbl = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 12,
  color: "var(--ink-700)",
} as const;

/** The four marks: a check, an ink spinner (never blue), a dashed circle for waiting, a red × for failed. */
export function Marks() {
  return (
    <div style={{ display: "flex", gap: 20 }}>
      <span style={lbl}>
        <StepMark state="done" /> done
      </span>
      <span style={lbl}>
        <StepMark state="now" /> now
      </span>
      <span style={lbl}>
        <StepMark state="later" /> later
      </span>
      <span style={lbl}>
        <StepMark state="fail" /> fail
      </span>
    </div>
  );
}
