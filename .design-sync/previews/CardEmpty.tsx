import { CardEmpty, GhostRows } from "advantage-analytics-ds";

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
const ghostRow =
  "flex items-center gap-4 py-2.5 border-t border-[var(--border-hairline)]";

/** The card's own shape in grey, then the band: a title, one sentence, at most one outline action. */
export function WithAction() {
  return (
    <div
      style={{
        maxWidth: 460,
        padding: 20,
        borderRadius: 14,
        border: "1px solid var(--border-card)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <span
        style={{
          display: "block",
          fontSize: 13,
          fontWeight: 500,
          color: "var(--ink-900)",
          marginBottom: 10,
        }}
      >
        Recent matches
      </span>
      <CardEmpty
        description="Three empty match rows: opponent, score and result."
        band={{
          title: "No matches yet",
          body: "Upload a match video or a SwingVision export and it shows up here with its statistics.",
          action: { label: "Upload a match", href: "/dashboard/matches/new" },
        }}
      >
        <GhostRows className={ghostRow}>
          {rule("60%", true)}
          {rule(80)}
          {rule(48)}
        </GhostRows>
      </CardEmpty>
    </div>
  );
}

/** A viewer who cannot act gets the band without the button. */
export function WithoutAction() {
  return (
    <div
      style={{
        maxWidth: 460,
        padding: 20,
        borderRadius: 14,
        border: "1px solid var(--border-card)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <span
        style={{
          display: "block",
          fontSize: 13,
          fontWeight: 500,
          color: "var(--ink-900)",
          marginBottom: 10,
        }}
      >
        Serve placement
      </span>
      <CardEmpty
        description="An empty court diagram."
        band={{
          title: "No serves recorded",
          body: "Maya's serve placement fills in after her first analyzed match.",
        }}
      >
        <div
          style={{
            height: 96,
            borderRadius: 8,
            border: "1px solid var(--ink-300)",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 0,
          }}
        >
          <span style={{ borderRight: "1px solid var(--ink-300)" }} />
        </div>
      </CardEmpty>
    </div>
  );
}
