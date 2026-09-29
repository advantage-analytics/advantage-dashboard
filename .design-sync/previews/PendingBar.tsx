import { PendingBar } from "advantage-analytics-ds";

/** One pulsing bar in the skeleton token, 12px tall. It fills its parent, so a wrapper sets the width. */
export function Bars() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        maxWidth: 320,
      }}
    >
      <div style={{ width: "60%" }}>
        <PendingBar />
      </div>
      <PendingBar />
      <div style={{ width: "40%" }}>
        <PendingBar />
      </div>
    </div>
  );
}

/** `tone="inverse"` on the brand gradient — the header's Beta pill while its hours load. The grey skeleton token vanishes there; the inverse bar is white at 30%. */
export function Inverse() {
  return (
    <div
      className="brand-mesh-gradient"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        height: 28,
        padding: "0 12px",
        borderRadius: 9999,
        color: "white",
        fontSize: 12,
        fontWeight: 500,
      }}
    >
      Beta
      <PendingBar tone="inverse" className="h-2 w-[46px]" />
    </div>
  );
}
