import { useState } from "react";
import { AdvSelect } from "advantage-analytics-ds";

const col = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  maxWidth: 260,
} as const;
const cap = { fontSize: 11, color: "var(--ink-600)" } as const;
const OPTS = (
  <>
    <option value="">Choose a division</option>
    <option value="d1">NCAA Division I</option>
    <option value="d2">NCAA Division II</option>
    <option value="d3">NCAA Division III</option>
    <option value="naia">NAIA</option>
  </>
);

/** The default kind — a form field with the caption's hairline beneath. */
export function Underline() {
  const [v, setV] = useState("d1");
  return (
    <div style={col}>
      <span style={cap}>Division</span>
      <AdvSelect value={v} onChange={(e) => setV(e.target.value)}>
        {OPTS}
      </AdvSelect>
    </div>
  );
}

/** `boxed` at both size tiers — the same box as the button beside it. */
export function Boxed() {
  const [v, setV] = useState("d2");
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        maxWidth: 260,
      }}
    >
      <AdvSelect
        kind="boxed"
        fieldSize="md"
        value={v}
        onChange={(e) => setV(e.target.value)}
      >
        {OPTS}
      </AdvSelect>
      <AdvSelect
        kind="boxed"
        fieldSize="sm"
        value={v}
        onChange={(e) => setV(e.target.value)}
      >
        {OPTS}
      </AdvSelect>
    </div>
  );
}

/** An empty-string value is the placeholder state: grey ink, like a text field. */
export function Placeholder() {
  const [v, setV] = useState("");
  return (
    <div style={col}>
      <span style={cap}>Division</span>
      <AdvSelect value={v} onChange={(e) => setV(e.target.value)}>
        {OPTS}
      </AdvSelect>
    </div>
  );
}

export function Disabled() {
  return (
    <div style={col}>
      <span style={cap}>Division</span>
      <AdvSelect value="d1" disabled onChange={() => {}}>
        {OPTS}
      </AdvSelect>
    </div>
  );
}
