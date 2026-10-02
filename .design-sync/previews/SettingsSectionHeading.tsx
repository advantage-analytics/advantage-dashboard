import { SettingsSectionHeading } from "advantage-analytics-ds";

/** `01 · General information` — the mono number, the 14px title, an optional right-aligned aside. */
export function Numbered() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 22,
        maxWidth: 520,
      }}
    >
      <SettingsSectionHeading
        number="01"
        title="General information"
        note="Only your name is visible to teammates"
      />
      <SettingsSectionHeading number="02" title="Playing style" />
    </div>
  );
}
