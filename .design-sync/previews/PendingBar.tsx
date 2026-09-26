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
