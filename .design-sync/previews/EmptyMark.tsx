import { EmptyMark, ResultMark, ScoreLine } from "advantage-analytics-ds";

const grid = {
  display: "grid",
  gridTemplateColumns: "1fr 90px 60px",
  alignItems: "center",
  fontSize: 13,
  color: "var(--ink-900)",
  maxWidth: 380,
} as const;
const cell = {
  padding: "8px 0",
  borderTop: "1px solid var(--border-hairline)",
} as const;
const head = {
  fontSize: 10,
  letterSpacing: "1px",
  textTransform: "uppercase",
  color: "var(--ink-500)",
  padding: "0 0 6px",
} as const;

/** The not-yet value in a table cell: one em dash, flush with the column's real values, never centred. */
export function InColumn() {
  return (
    <div style={grid}>
      <span style={head}>Opponent</span>
      <span style={{ ...head, textAlign: "right" }}>Score</span>
      <span style={{ ...head, textAlign: "right" }}>Result</span>
      <span style={cell}>Elena Vargas</span>
      <span style={{ ...cell, textAlign: "right" }}>
        <ScoreLine
          sets={[
            { player1: 6, player2: 4 },
            { player1: 7, player2: 5 },
          ]}
        />
      </span>
      <span style={{ ...cell, textAlign: "right" }}>
        <ResultMark won />
      </span>
      <span style={cell}>Meridian State · S2</span>
      <span style={{ ...cell, textAlign: "right" }}>
        <EmptyMark label="No score yet" />
      </span>
      <span style={{ ...cell, textAlign: "right" }}>
        <EmptyMark label="Not decided" />
      </span>
      <span style={cell}>Priya Nair</span>
      <span style={{ ...cell, textAlign: "right" }}>
        <ScoreLine
          sets={[
            { player1: 3, player2: 6 },
            { player1: 6, player2: 7, player1Tiebreak: 5, player2Tiebreak: 7 },
          ]}
        />
      </span>
      <span style={{ ...cell, textAlign: "right" }}>
        <ResultMark won={false} />
      </span>
    </div>
  );
}
