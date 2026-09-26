import { StatePill } from "advantage-analytics-ds";

/** A row's state, named. Grey always — blue is for actions, and a state is not one. */
export function States() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <StatePill>Draft</StatePill>
      <StatePill>Shared</StatePill>
      <StatePill>Private</StatePill>
      <StatePill>Coach</StatePill>
    </div>
  );
}

/** `outline` for a state that is promised, not held — `Invited` beside members who are here. */
export function Outline() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <StatePill outline>Invited</StatePill>
      <StatePill>Player</StatePill>
    </div>
  );
}

/** Beside a name in a row — max one state per row. */
export function InRow() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        fontSize: 13,
        color: "var(--ink-900)",
        maxWidth: 320,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontWeight: 500 }}>Jordan Lee</span>
        <StatePill>Draft</StatePill>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontWeight: 500 }}>Maya Okafor</span>
        <StatePill outline>Invited</StatePill>
      </div>
    </div>
  );
}
