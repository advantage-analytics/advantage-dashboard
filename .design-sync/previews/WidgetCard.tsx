import { ScoreLine, WidgetCard } from "advantage-analytics-ds";

/** Eyebrow header with an uppercase action link, padded body. */
export function WithAction() {
  return (
    <div style={{ maxWidth: 460 }}>
      <WidgetCard
        header="Recent matches"
        actionLabel="View all"
        actionHref="/dashboard/matches"
        secondaryLabel="Last 30 days"
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 13,
            color: "var(--ink-900)",
          }}
        >
          {[
            [
              "Elena Vargas",
              [
                { player1: 6, player2: 4 },
                { player1: 7, player2: 5 },
              ],
            ],
            [
              "Priya Nair",
              [
                { player1: 3, player2: 6 },
                {
                  player1: 6,
                  player2: 7,
                  player1Tiebreak: 5,
                  player2Tiebreak: 7,
                },
              ],
            ],
          ].map(([n, s]) => (
            <div
              key={n as string}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "9px 0",
                borderTop: "1px solid var(--border-hairline)",
              }}
            >
              <span>vs. {n as string}</span>
              <ScoreLine sets={s as any} style={{ color: "var(--ink-700)" }} />
            </div>
          ))}
        </div>
      </WidgetCard>
    </div>
  );
}

/** `noPadding` for a body that draws its own edges — a full-bleed table or chart. */
export function NoPadding() {
  return (
    <div style={{ maxWidth: 460 }}>
      <WidgetCard header="Serve placement" noPadding>
        <div
          style={{
            height: 120,
            background: "linear-gradient(180deg, var(--surface-subtle), #fff)",
            borderTop: "1px solid var(--border-hairline)",
          }}
        />
      </WidgetCard>
    </div>
  );
}
