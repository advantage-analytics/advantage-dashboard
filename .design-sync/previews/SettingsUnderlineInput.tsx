import { useState } from "react";
import { SettingsUnderlineInput } from "advantage-analytics-ds";

/** The underline input: 34px, a hairline that goes 2px blue only while focused. `mono` for machine values. */
export function Values() {
  const [a, setA] = useState("Elena Vargas");
  const [b, setB] = useState("");
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        maxWidth: 260,
      }}
    >
      <SettingsUnderlineInput
        value={a}
        onChange={(e) => setA(e.target.value)}
      />
      <SettingsUnderlineInput
        value={b}
        placeholder="Opponent's school"
        onChange={(e) => setB(e.target.value)}
      />
      <SettingsUnderlineInput mono value="pl_8f2c1a" readOnly />
    </div>
  );
}
