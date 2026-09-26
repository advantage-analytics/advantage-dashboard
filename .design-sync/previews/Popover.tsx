import { useState } from "react";
import {
  AdvSwitch,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SettingsButton,
} from "advantage-analytics-ds";

/** The positioning primitive `FloatMenu` and the filter panels are built on, holding a small form. */
export function FilterPanel() {
  const [wins, setWins] = useState(true);
  const [video, setVideo] = useState(false);
  return (
    <div style={{ paddingBottom: 170 }}>
      <Popover open>
        <PopoverTrigger asChild>
          <SettingsButton variant="outline" size="sm" aria-expanded>
            Filter · 1
          </SettingsButton>
        </PopoverTrigger>
        <PopoverContent style={{ width: 260, padding: 14 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              fontSize: 12,
              color: "var(--ink-900)",
            }}
          >
            <span style={{ fontSize: 11, color: "var(--ink-500)" }}>
              Show matches
            </span>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              Wins only
              <AdvSwitch
                checked={wins}
                onCheckedChange={setWins}
                label="Wins only"
              />
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              With video
              <AdvSwitch
                checked={video}
                onCheckedChange={setVideo}
                label="With video"
              />
            </label>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
