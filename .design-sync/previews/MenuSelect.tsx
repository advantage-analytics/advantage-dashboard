import { useState } from "react";
import { MenuSelect } from "advantage-analytics-ds";

const SURFACES = [
  { value: "hard", label: "Hard", description: "Most college duals." },
  { value: "clay", label: "Clay", description: "Slower, higher bounce." },
  { value: "grass", label: "Grass" },
];
const cap = { fontSize: 11, color: "var(--ink-600)" } as const;

/** The default trigger — 30px, bordered — the control beside a settings row label. */
export function Pill() {
  const [v, setV] = useState("hard");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <span style={{ fontSize: 12, color: "var(--ink-900)" }}>
        Court surface
      </span>
      <MenuSelect
        label="Court surface"
        value={v}
        onChange={setV}
        options={SURFACES}
        note="Indoor courts arrive with the winter schedule."
      />
    </div>
  );
}

/** A form field: full width, the caption's hairline beneath, no radius. */
export function Underline() {
  const [v, setV] = useState("clay");
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxWidth: 280,
      }}
    >
      <span style={cap}>Surface</span>
      <MenuSelect
        label="Surface"
        variant="underline"
        value={v}
        onChange={setV}
        options={SURFACES}
      />
    </div>
  );
}

/** A value inside a table row — words and a small chevron, no border. */
export function Text() {
  const [v, setV] = useState("grass");
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 120px",
        alignItems: "center",
        gap: 16,
        fontSize: 12,
        color: "var(--ink-900)",
        padding: "8px 0",
        borderTop: "1px solid var(--border-hairline)",
        borderBottom: "1px solid var(--border-hairline)",
      }}
    >
      <span>vs. Meridian State · Sep 28</span>
      <MenuSelect
        label="Surface for this match"
        variant="text"
        value={v}
        onChange={setV}
        options={SURFACES}
      />
    </div>
  );
}

/** `undefined` is a real state: no row chosen, the placeholder in empty-field ink. Disabled beside it. */
export function EmptyAndDisabled() {
  const [v, setV] = useState<string | undefined>(undefined);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        maxWidth: 280,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={cap}>Playing hand</span>
        <MenuSelect
          label="Playing hand"
          variant="underline"
          value={v}
          placeholder="Choose a hand"
          onChange={setV}
          options={[
            { value: "right", label: "Right-handed" },
            { value: "left", label: "Left-handed" },
          ]}
        />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <span style={{ fontSize: 12, color: "var(--ink-900)" }}>Season</span>
        <MenuSelect
          label="Season"
          value="2026"
          disabled
          onChange={() => {}}
          options={[{ value: "2026", label: "2026–27" }]}
        />
      </div>
    </div>
  );
}
