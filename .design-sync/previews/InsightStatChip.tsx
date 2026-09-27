import { InsightStatChip } from "advantage-analytics-ds";

/** Bare evidence beside AI prose: a 9px letter-spaced label on a 12px tabular value. */
export function Evidence() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 22 }}>
      <InsightStatChip label="First serve in" value="64%" />
      <InsightStatChip label="Return games won" value="38%" change={6} />
      <InsightStatChip
        label="Double faults"
        value="5"
        change={-3}
        lowerIsBetter
      />
      <InsightStatChip
        label="Unforced errors"
        value="21"
        change={4}
        lowerIsBetter
      />
    </div>
  );
}

/** Under a claim, the way `InsightCard` lays it out — computed numbers, never invented. */
export function UnderAClaim() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        maxWidth: 420,
      }}
    >
      <span className="text-title">
        Your second serve is winning more points than your first.
      </span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 22 }}>
        <InsightStatChip label="1st serve pts won" value="52%" change={-4} />
        <InsightStatChip label="2nd serve pts won" value="58%" change={7} />
      </div>
      <span className="text-micro">from 12 analyzed matches</span>
    </div>
  );
}
