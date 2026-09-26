import { useState } from "react";
import { SettingsField, SettingsUnderlineInput } from "advantage-analytics-ds";

/** The 11px caption over an underlined control; `required` draws the one red asterisk. */
export function Fields() {
  const [name, setName] = useState("Jordan Lee");
  const [town, setTown] = useState("");
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "18px 24px",
        maxWidth: 480,
      }}
    >
      <SettingsField label="Full name" required>
        <SettingsUnderlineInput
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </SettingsField>
      <SettingsField
        label="Hometown"
        hint="Optional — shown on your player profile."
      >
        <SettingsUnderlineInput
          value={town}
          placeholder="Palo Alto, CA"
          onChange={(e) => setTown(e.target.value)}
        />
      </SettingsField>
    </div>
  );
}

/** `marker` sits right of the caption — the blue MISSING tag on an empty field. */
export function WithMarker() {
  return (
    <div style={{ maxWidth: 228 }}>
      <SettingsField
        label="Graduation year"
        marker={
          <span
            style={{
              fontSize: 9,
              letterSpacing: "1px",
              fontWeight: 500,
              color: "var(--blue)",
            }}
          >
            MISSING
          </span>
        }
      >
        <SettingsUnderlineInput placeholder="2028" onChange={() => {}} />
      </SettingsField>
    </div>
  );
}
