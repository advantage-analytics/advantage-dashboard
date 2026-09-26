import { useState } from "react";
import { DateField } from "advantage-analytics-ds";

const col = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  maxWidth: 240,
} as const;
const cap = { fontSize: 11, color: "var(--ink-600)" } as const;

/** The default — a 34px form field, segments typed one at a time, the calendar button at the end. */
export function Underline() {
  const [v, setV] = useState("2026-09-21");
  return (
    <div style={col}>
      <span style={cap}>Played on</span>
      <DateField label="Played on" value={v} onChange={setV} />
    </div>
  );
}

/** Empty: placeholder segments in ink-400 until each is typed. */
export function Empty() {
  const [v, setV] = useState("");
  return (
    <div style={col}>
      <span style={cap}>Event date</span>
      <DateField label="Event date" value={v} onChange={setV} required />
    </div>
  );
}

/** `boxed` — the 30px bordered box beside a filter caption. */
export function Boxed() {
  const [from, setFrom] = useState("2026-08-01");
  const [to, setTo] = useState("2026-09-30");
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 12,
        color: "var(--ink-700)",
      }}
    >
      From{" "}
      <DateField
        label="From"
        variant="boxed"
        value={from}
        onChange={setFrom}
        max={to}
      />
      to{" "}
      <DateField
        label="To"
        variant="boxed"
        value={to}
        onChange={setTo}
        min={from}
      />
    </div>
  );
}

export function Disabled() {
  return (
    <div style={col}>
      <span style={cap}>Claimed on</span>
      <DateField
        label="Claimed on"
        value="2026-08-26"
        onChange={() => {}}
        disabled
      />
    </div>
  );
}
