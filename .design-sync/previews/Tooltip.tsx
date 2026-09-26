import { Upload } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "advantage-analytics-ds";

const iconBtn = {
  display: "flex",
  width: 32,
  height: 32,
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 8,
  border: "1px solid var(--border-field)",
  background: "var(--surface-card)",
  color: "var(--ink-700)",
  cursor: "pointer",
} as const;

/** The dark tooltip, open: ink-900 surface, white 12px text, the arrow on. */
export function Open() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        paddingTop: 8,
        paddingBottom: 60,
      }}
    >
      <Tooltip open>
        <TooltipTrigger asChild>
          <button type="button" aria-label="Upload a match" style={iconBtn}>
            <Upload className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Upload a match</TooltipContent>
      </Tooltip>
    </div>
  );
}

/** `showArrow={false}` — the chrome variant `ChromeTooltip` uses. */
export function NoArrow() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        paddingTop: 8,
        paddingBottom: 60,
      }}
    >
      <Tooltip open>
        <TooltipTrigger asChild>
          <button type="button" aria-label="Upload a match" style={iconBtn}>
            <Upload className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" showArrow={false}>
          Upload a match
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
