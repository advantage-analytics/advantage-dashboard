import { EmptyMark, ResultMark } from "advantage-analytics-ds";

const lbl = { fontSize: 12, color: "var(--ink-700)" } as const;

/** Won, lost or level — the product's one outcome register, at 14px stroke 1.5. */
export function Outcomes() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 6, ...lbl }}>
        <ResultMark won /> Won
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 6, ...lbl }}>
        <ResultMark won={false} /> Lost
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 6, ...lbl }}>
        <ResultMark won={null} /> Level
      </span>
    </div>
  );
}

/** In a Result column: decided rows draw the glyph, an undecided one the em dash, on the same x. */
export function InColumn() {
  const rows: [string, boolean | null | undefined][] = [
    ["vs. Elena Vargas", true],
    ["vs. Priya Nair", false],
    ["Dual · Meridian State", null],
    ["vs. Sam Whitfield", undefined],
  ];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 60px",
        alignItems: "center",
        fontSize: 13,
        color: "var(--ink-900)",
        maxWidth: 320,
      }}
    >
      {rows.map(([who, won]) => (
        <div key={who} style={{ display: "contents" }}>
          <span
            style={{
              padding: "8px 0",
              borderTop: "1px solid var(--border-hairline)",
            }}
          >
            {who}
          </span>
          <span
            style={{
              padding: "8px 0",
              borderTop: "1px solid var(--border-hairline)",
              textAlign: "right",
            }}
          >
            {won === undefined ? (
              <EmptyMark label="Not decided" />
            ) : (
              <ResultMark won={won} />
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
