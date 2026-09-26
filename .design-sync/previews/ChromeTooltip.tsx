import { Bell, Search, Upload } from "lucide-react";
import { ChromeTooltip, TooltipProvider } from "advantage-analytics-ds";

const iconBtn = {
  display: "flex",
  width: 32,
  height: 32,
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 8,
  border: 0,
  background: "transparent",
  color: "var(--ink-700)",
  cursor: "pointer",
} as const;

/** A header cluster: every icon-only control carries an `aria-label` and a dark tooltip; the provider shares the skip-delay. The label reveals on hover, after 400ms. */
export function HeaderCluster() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <TooltipProvider>
        <div style={{ display: "flex", gap: 4 }}>
          <ChromeTooltip label="Search" shortcut="⌘K">
            <button type="button" aria-label="Search" style={iconBtn}>
              <Search
                className="size-[15px]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </button>
          </ChromeTooltip>
          <ChromeTooltip
            label="Upload a match"
            shortcut="⌘U"
            detail="Video or a SwingVision export"
          >
            <button type="button" aria-label="Upload a match" style={iconBtn}>
              <Upload
                className="size-[15px]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </button>
          </ChromeTooltip>
          <ChromeTooltip label="Activity" detail="2 analyses running">
            <button type="button" aria-label="Activity" style={iconBtn}>
              <Bell
                className="size-[15px]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </button>
          </ChromeTooltip>
        </div>
      </TooltipProvider>
      <span style={{ fontSize: 11, color: "var(--ink-500)" }}>
        Hover a control — the label, its shortcut in mono and an optional second
        line appear beneath it.
      </span>
    </div>
  );
}
