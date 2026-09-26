import { PlayerMark } from "advantage-analytics-ds";

const svg = encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#BFD5FB"/><circle cx="20" cy="15" r="7" fill="#3B82F6"/><path d="M6 38c2-9 8-13 14-13s12 4 14 13z" fill="#3B82F6"/></svg>',
);
const photo = `data:image/svg+xml;utf8,${svg}`;

/** The roster's name column: the viewer's own photo on their row, a teammate's where the page has one, initials otherwise. */
export function RosterRows() {
  const rows = [
    { name: "Jordan Lee", viewer: { initials: "JL", avatarUrl: photo } },
    { name: "Elena Vargas", viewer: null, photoUrl: photo },
    { name: "Priya Nair", viewer: null },
  ];
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
      {rows.map((r) => (
        <div
          key={r.name}
          style={{ display: "flex", alignItems: "center", gap: 10 }}
        >
          <PlayerMark name={r.name} viewer={r.viewer} photoUrl={r.photoUrl} />
          <span style={{ fontWeight: 500 }}>{r.name}</span>
        </div>
      ))}
    </div>
  );
}
