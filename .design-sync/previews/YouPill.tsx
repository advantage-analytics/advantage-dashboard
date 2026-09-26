import { InitialsAvatar, YouPill } from "advantage-analytics-ds";

/** The viewer's own row, marked — "You" straight after the name, grey, on every surface. */
export function OnYourRow() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        fontSize: 13,
        color: "var(--ink-900)",
        maxWidth: 320,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <InitialsAvatar name="Jordan Lee" />
        <span style={{ fontWeight: 500 }}>Jordan Lee</span>
        <YouPill />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <InitialsAvatar name="Elena Vargas" />
        <span style={{ fontWeight: 500 }}>Elena Vargas</span>
      </div>
    </div>
  );
}
