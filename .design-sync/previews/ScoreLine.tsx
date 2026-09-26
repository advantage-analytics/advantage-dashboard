import { ScoreLine } from "advantage-analytics-ds";

const row = {
  display: "flex",
  alignItems: "baseline",
  gap: 14,
  fontSize: 13,
  color: "var(--ink-900)",
} as const;
const who = { minWidth: 130, color: "var(--ink-700)" } as const;

/** A match score in the one spelling the product uses — sets joined by ", ", games by "-". */
export function StraightSets() {
  return (
    <div style={row}>
      <span style={who}>vs. Elena Vargas</span>
      <ScoreLine
        sets={[
          { player1: 6, player2: 4 },
          { player1: 6, player2: 2 },
        ]}
      />
    </div>
  );
}

/** A tiebreak is a superscript, never parentheses — the loser's points, raised 0.6em. */
export function Tiebreak() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={row}>
        <span style={who}>vs. Priya Nair</span>
        <ScoreLine
          sets={[
            { player1: 7, player2: 6, player1Tiebreak: 7, player2Tiebreak: 3 },
            { player1: 6, player2: 7, player1Tiebreak: 5, player2Tiebreak: 7 },
            { player1: 6, player2: 3 },
          ]}
        />
      </div>
      <div style={row}>
        <span style={who}>vs. Sam Whitfield</span>
        <ScoreLine
          sets={[
            { player1: 4, player2: 6 },
            { player1: 6, player2: 7, player1Tiebreak: 8, player2Tiebreak: 10 },
          ]}
        />
      </div>
    </div>
  );
}

/** The same markup at a display size — the superscript scales with the em. */
export function Large() {
  return (
    <ScoreLine
      sets={[
        { player1: 7, player2: 6, player1Tiebreak: 7, player2Tiebreak: 4 },
        { player1: 6, player2: 4 },
      ]}
      style={{
        fontSize: 30,
        fontWeight: 300,
        letterSpacing: "-0.6px",
        color: "var(--ink-900)",
      }}
    />
  );
}
