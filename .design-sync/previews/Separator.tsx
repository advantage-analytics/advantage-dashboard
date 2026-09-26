import { Separator } from "advantage-analytics-ds";

/** A hairline in `--border-medium`, horizontal between blocks. */
export function Horizontal() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        fontSize: 12,
        color: "var(--ink-700)",
        maxWidth: 320,
      }}
    >
      <span>First serve in · 64%</span>
      <Separator />
      <span>Second serve in · 91%</span>
    </div>
  );
}

/** Vertical inside a toolbar row. */
export function Vertical() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        height: 20,
        fontSize: 12,
        color: "var(--ink-700)",
      }}
    >
      <span>12 matches</span>
      <Separator orientation="vertical" />
      <span>8 won</span>
      <Separator orientation="vertical" />
      <span>Fall 2026</span>
    </div>
  );
}
