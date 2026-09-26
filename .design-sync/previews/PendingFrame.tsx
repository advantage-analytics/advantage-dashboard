import { PendingBar, PendingFrame } from "advantage-analytics-ds";

/** A whole route's loading state: the white ground, pulsing as one. */
export function MatchPage() {
  return (
    <div style={{ maxWidth: 520, minHeight: 220, display: "flex" }}>
      <PendingFrame label="match">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            padding: 4,
          }}
        >
          <div style={{ width: "46%" }}>
            <PendingBar className="h-[22px]" />
          </div>
          <div style={{ width: "30%" }}>
            <PendingBar />
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 12,
              marginTop: 8,
            }}
          >
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  padding: 14,
                  borderRadius: 14,
                  border: "1px solid var(--border-card)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div style={{ width: "50%" }}>
                  <PendingBar />
                </div>
                <div style={{ width: "36%" }}>
                  <PendingBar className="h-[24px]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </PendingFrame>
    </div>
  );
}

/** `pulse={false}` when the frame holds real text the page already knows — only the bars pulse. */
export function WithKnownTitle() {
  return (
    <div style={{ maxWidth: 520, display: "flex" }}>
      <PendingFrame label="upload wizard" pulse={false}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            padding: 4,
          }}
        >
          <span className="text-title">Upload a match</span>
          <span style={{ fontSize: 12, color: "var(--ink-600)" }}>
            Step 2 of 4 · Match
          </span>
          <div style={{ width: "70%" }}>
            <PendingBar />
          </div>
          <div style={{ width: "55%" }}>
            <PendingBar />
          </div>
        </div>
      </PendingFrame>
    </div>
  );
}
