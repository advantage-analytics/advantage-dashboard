import { InitialsAvatar } from "advantage-analytics-ds";

/** The 26px initials mark that leads a person's name in a table row. */
export function LeadingNames() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        fontSize: 13,
        color: "var(--ink-900)",
        maxWidth: 300,
      }}
    >
      {["Jordan Lee", "Elena Vargas", "Priya Nair", "Tomás Ruiz-Ortega"].map(
        (n) => (
          <div
            key={n}
            style={{ display: "flex", alignItems: "center", gap: 10 }}
          >
            <InitialsAvatar name={n} />
            <span style={{ fontWeight: 500 }}>{n}</span>
          </div>
        ),
      )}
    </div>
  );
}
