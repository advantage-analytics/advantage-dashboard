import { GhostRows } from "advantage-analytics-ds";

const rule = (w: string | number, grow = false) => (
  <span
    style={{
      display: "block",
      height: 8,
      width: w,
      flex: grow ? "1 1 auto" : "0 0 auto",
      borderRadius: 3,
      background: "var(--ink-200)",
    }}
  />
);

/** Three rows of one table's grid, fading on the shared ladder — one row's grey rules, drawn on every row. */
export function ThreeRows() {
  return (
    <div style={{ maxWidth: 420 }}>
      <GhostRows className="flex items-center gap-4 border-t border-[var(--border-hairline)] py-2.5">
        {rule("60%", true)}
        {rule(80)}
        {rule(48)}
      </GhostRows>
    </div>
  );
}
