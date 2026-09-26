import { useState } from "react";
import { AdvSwitch } from "advantage-analytics-ds";

const row = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 24,
  maxWidth: 320,
  fontSize: 12,
  color: "var(--ink-900)",
} as const;

/** 36×20, Signal Blue on, ink-200 off. The visible label is the row it sits in. */
export function States() {
  const [a, setA] = useState(true);
  const [b, setB] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={row}>
        Share match film with the program
        <AdvSwitch
          checked={a}
          onCheckedChange={setA}
          label="Share match film with the program"
        />
      </div>
      <div style={row}>
        Weekly digest
        <AdvSwitch checked={b} onCheckedChange={setB} label="Weekly digest" />
      </div>
    </div>
  );
}

export function Disabled() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ ...row, color: "var(--ink-500)" }}>
        Coach-managed profile
        <AdvSwitch
          checked
          disabled
          onCheckedChange={() => {}}
          label="Coach-managed profile"
        />
      </div>
      <div style={{ ...row, color: "var(--ink-500)" }}>
        Public results
        <AdvSwitch
          checked={false}
          disabled
          onCheckedChange={() => {}}
          label="Public results"
        />
      </div>
    </div>
  );
}
