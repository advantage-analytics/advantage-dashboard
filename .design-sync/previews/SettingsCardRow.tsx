import { useState } from "react";
import { AdvSwitch, MenuSelect, SettingsCardRow } from "advantage-analytics-ds";

/** One row inside a card: label and description left, control right, hairline above. */
export function Rows() {
  const [on, setOn] = useState(true);
  const [role, setRole] = useState("player");
  return (
    <div style={{ maxWidth: 480 }}>
      <SettingsCardRow
        label="Email me when an analysis finishes"
        description="One message per match."
        control={
          <AdvSwitch
            checked={on}
            onCheckedChange={setOn}
            label="Email on analysis finished"
          />
        }
      />
      <SettingsCardRow
        label="Default role for invites"
        control={
          <MenuSelect
            label="Default role"
            value={role}
            onChange={setRole}
            options={[
              { value: "player", label: "Player" },
              {
                value: "staff",
                label: "Staff",
                description: "Sees the roster; uploads nothing.",
              },
              { value: "coach", label: "Coach" },
            ]}
          />
        }
      />
    </div>
  );
}

/** `align="start"` when a two-line row sits beside a taller control. */
export function AlignStart() {
  const [v, setV] = useState("program");
  return (
    <div style={{ maxWidth: 480 }}>
      <SettingsCardRow
        align="start"
        label="Who can see match film"
        description="Applies to every match you upload from now on. Coaches can always see film uploaded to the program."
        control={
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              fontSize: 12,
              color: "var(--ink-900)",
            }}
          >
            {[
              ["program", "Whole program"],
              ["coaches", "Coaches only"],
              ["me", "Only me"],
            ].map(([k, l]) => (
              <label
                key={k}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name="vis"
                  checked={v === k}
                  onChange={() => setV(k)}
                />
                {l}
              </label>
            ))}
          </div>
        }
      />
    </div>
  );
}
