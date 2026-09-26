import { Kbd } from "advantage-analytics-ds";

const hint = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  color: "var(--ink-700)",
} as const;

/** The help page's keycap — bordered, on the raised surface. */
export function Raised() {
  return (
    <div style={hint}>
      Press <Kbd>⌘</Kbd> <Kbd>U</Kbd> to upload a match
    </div>
  );
}

/** The search palette's hint — flat fill, muted ink, so a row reads as hints. */
export function Flat() {
  return (
    <div style={{ display: "flex", gap: 18 }}>
      <span style={hint}>
        <Kbd variant="flat" size="xs">
          ↑
        </Kbd>
        <Kbd variant="flat" size="xs">
          ↓
        </Kbd>{" "}
        to move
      </span>
      <span style={hint}>
        <Kbd variant="flat" size="xs">
          ↵
        </Kbd>{" "}
        to open
      </span>
      <span style={hint}>
        <Kbd variant="flat" size="xs">
          esc
        </Kbd>{" "}
        to close
      </span>
    </div>
  );
}

export function Sizes() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <span style={hint}>
        <Kbd size="xs">?</Kbd> xs
      </span>
      <span style={hint}>
        <Kbd size="sm">?</Kbd> sm
      </span>
      <span style={hint}>
        <Kbd size="md">?</Kbd> md
      </span>
    </div>
  );
}

/** Prefix glyphs are machine values; the DS sets those in mono. */
export function Mono() {
  return (
    <div style={hint}>
      <Kbd mono>⌥</Kbd> <Kbd mono>⇧</Kbd> <Kbd>F</Kbd> toggles fullscreen film
    </div>
  );
}
