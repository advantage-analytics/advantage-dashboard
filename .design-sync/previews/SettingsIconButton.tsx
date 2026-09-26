import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { SettingsIconButton } from "advantage-analytics-ds";

/** A 20px square icon-only button; `tone="danger"` only changes the hover ink. */
export function Stepper() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        color: "var(--ink-900)",
      }}
    >
      <SettingsIconButton label="Previous month">
        <ChevronLeft
          className="size-3.5"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </SettingsIconButton>
      <span
        className="tabular-nums"
        style={{ minWidth: 92, textAlign: "center" }}
      >
        September 2026
      </span>
      <SettingsIconButton label="Next month">
        <ChevronRight
          className="size-3.5"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </SettingsIconButton>
    </div>
  );
}

export function Remove() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        maxWidth: 260,
        fontSize: 13,
        color: "var(--ink-900)",
      }}
    >
      <span>Priya Nair</span>
      <SettingsIconButton label="Remove Priya Nair" tone="danger">
        <X className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
      </SettingsIconButton>
    </div>
  );
}
