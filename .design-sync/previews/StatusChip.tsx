import { StatusChip } from "advantage-analytics-ds";

const row = { display: "flex", alignItems: "center", gap: 20 } as const;

/** The four tones. A dot and a word — no container, so it sits beside a score. */
export function Tones() {
  return (
    <div style={row}>
      <StatusChip tone="neutral">Queued</StatusChip>
      <StatusChip tone="blue">Analyzing</StatusChip>
      <StatusChip tone="win">Won</StatusChip>
      <StatusChip tone="loss">Lost</StatusChip>
    </div>
  );
}

/** `live` pulses the dot — only for a job that is animating on the match page too. */
export function Live() {
  return (
    <div style={row}>
      <StatusChip tone="blue" live>
        Analyzing
      </StatusChip>
      <StatusChip tone="neutral">Uploaded</StatusChip>
    </div>
  );
}

/** The matches list turns the dot off: the tone colour carries the state alone. */
export function WithoutDot() {
  return (
    <div style={row}>
      <StatusChip tone="win" dot={false}>
        Won
      </StatusChip>
      <StatusChip tone="loss" dot={false}>
        Lost
      </StatusChip>
      <StatusChip tone="blue" dot={false}>
        Analyzing
      </StatusChip>
    </div>
  );
}

/** Beside a score in a row — the chip separates the state from the sentence around it. */
export function InRow() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        fontSize: 13,
        color: "var(--ink-900)",
      }}
    >
      <span style={{ fontWeight: 500 }}>vs. Elena Vargas</span>
      <span className="tabular-nums" style={{ color: "var(--ink-700)" }}>
        6-4, 7-5
      </span>
      <StatusChip tone="blue" live>
        Analyzing
      </StatusChip>
    </div>
  );
}
