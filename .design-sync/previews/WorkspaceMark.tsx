import { WorkspaceMark } from "advantage-analytics-ds";

const crest = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#0D0D0D"/><path d="M20 6l12 5v9c0 8-5 13-12 15-7-2-12-7-12-15v-9z" fill="#3B82F6"/><path d="M20 12l7 3v6c0 5-3 8-7 9-4-1-7-4-7-9v-6z" fill="#fff"/></svg>')}`;
const rowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontSize: 13,
  color: "var(--ink-900)",
} as const;

/** A workspace's square: the letter on blue for personal, on ink for a team, a crest when the program set one. Never a circle. */
export function Switcher() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        maxWidth: 280,
      }}
    >
      <div style={rowStyle}>
        <WorkspaceMark
          workspace={{ kind: "personal", mark: "J", iconUrl: null }}
          className="size-[26px] rounded-[6px] text-[11px]"
        />
        <span style={{ fontWeight: 500 }}>Jordan Lee</span>
        <span style={{ fontSize: 11, color: "var(--ink-500)" }}>Personal</span>
      </div>
      <div style={rowStyle}>
        <WorkspaceMark
          workspace={{ kind: "team", mark: "MS", iconUrl: null }}
          className="size-[26px] rounded-[6px] text-[11px]"
        />
        <span style={{ fontWeight: 500 }}>Meridian State</span>
        <span style={{ fontSize: 11, color: "var(--ink-500)" }}>
          Team · Coach
        </span>
      </div>
      <div style={rowStyle}>
        <WorkspaceMark
          workspace={{ kind: "team", mark: "C", iconUrl: crest }}
          className="size-[26px] rounded-[6px] text-[11px]"
        />
        <span style={{ fontWeight: 500 }}>Cardinal</span>
        <span style={{ fontSize: 11, color: "var(--ink-500)" }}>
          Team · Player
        </span>
      </div>
    </div>
  );
}

/** Size, radius and letter type come from the call site. */
export function Sizes() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <WorkspaceMark
        workspace={{ kind: "team", mark: "MS" }}
        className="size-[22px] rounded-[5px] text-[9px]"
      />
      <WorkspaceMark
        workspace={{ kind: "team", mark: "MS" }}
        className="size-[26px] rounded-[6px] text-[11px]"
      />
      <WorkspaceMark
        workspace={{ kind: "team", mark: "MS" }}
        className="size-[40px] rounded-[10px] text-[15px]"
      />
    </div>
  );
}
