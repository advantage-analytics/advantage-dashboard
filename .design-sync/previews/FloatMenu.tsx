import { useState } from "react";
import { ChevronRight, Link2, Pencil, Trash2 } from "lucide-react";
import {
  FloatMenu,
  FloatMenuCaption,
  FloatMenuDivider,
  FloatMenuItem,
  FloatMenuLabel,
  FloatMenuNote,
  SettingsButton,
} from "advantage-analytics-ds";

const noop = () => {};

/** A row's action menu: leading glyphs, a hairline between groups, the closing note. */
export function ActionMenu() {
  const [open, setOpen] = useState(true);
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "flex-end",
        paddingBottom: 230,
      }}
    >
      <FloatMenu
        open={open}
        onOpenChange={setOpen}
        label="Match actions"
        trigger={
          <SettingsButton variant="outline" size="sm" aria-expanded={open}>
            Actions
          </SettingsButton>
        }
      >
        <FloatMenuItem
          label="Edit match"
          icon={<Pencil className="size-3" strokeWidth={1.5} />}
          onSelect={noop}
        />
        <FloatMenuItem
          label="Copy share link"
          icon={<Link2 className="size-3" strokeWidth={1.5} />}
          onSelect={noop}
        />
        <FloatMenuItem
          label="Advanced filters…"
          trailing={<ChevronRight className="size-3" strokeWidth={1.5} />}
          onSelect={noop}
        />
        <FloatMenuDivider />
        <FloatMenuItem
          label="Delete match"
          icon={<Trash2 className="size-3" strokeWidth={1.5} />}
          onSelect={noop}
        />
        <FloatMenuNote>
          Deleting a match removes its video and every statistic derived from
          it.
        </FloatMenuNote>
      </FloatMenu>
    </div>
  );
}

/** Selectable rows: a caption, second lines on what each means, the chosen check at the right edge. */
export function Options() {
  const [open, setOpen] = useState(true);
  const [surface, setSurface] = useState("hard");
  const rows = [
    {
      value: "hard",
      label: "Hard",
      description: "Most college duals — medium pace, true bounce.",
    },
    {
      value: "clay",
      label: "Clay",
      description: "Slower, higher bounce; longer rallies.",
    },
    {
      value: "grass",
      label: "Grass",
      description: "Fast and low; rare in the schedule.",
    },
    {
      value: "indoor",
      label: "Indoor",
      description: "Not yet supported for serve-speed estimates.",
      disabled: true,
    },
  ];
  return (
    <div style={{ display: "flex", paddingBottom: 330 }}>
      <FloatMenu
        open={open}
        onOpenChange={setOpen}
        label="Court surface"
        align="start"
        width={260}
        trigger={
          <SettingsButton variant="outline" size="sm" aria-expanded={open}>
            Surface · Hard
          </SettingsButton>
        }
      >
        <FloatMenuCaption>Court surface</FloatMenuCaption>
        {rows.map((r) => (
          <FloatMenuItem
            key={r.value}
            label={r.label}
            description={r.description}
            chosen={surface === r.value}
            disabled={r.disabled}
            onSelect={() => setSurface(r.value)}
          />
        ))}
        <FloatMenuNote>
          Indoor courts are coming with the winter schedule.
        </FloatMenuNote>
      </FloatMenu>
    </div>
  );
}

/** The dark tone the fullscreen film viewer draws its chrome on. */
export function DarkTone() {
  const [open, setOpen] = useState(true);
  const [view, setView] = useState("all");
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "flex-end",
        background: "var(--ink-900)",
        borderRadius: 10,
        padding: 14,
        paddingBottom: 250,
      }}
    >
      <FloatMenu
        open={open}
        onOpenChange={setOpen}
        label="Film view"
        tone="dark"
        trigger={
          <button
            type="button"
            aria-expanded={open}
            style={{
              color: "#fff",
              background: "rgba(255,255,255,0.1)",
              border: 0,
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            View · All points
          </button>
        }
      >
        <FloatMenuLabel>Saved views</FloatMenuLabel>
        <FloatMenuItem
          label="All points"
          chosen={view === "all"}
          onSelect={() => setView("all")}
        />
        <FloatMenuItem
          label="Second serves"
          description="12 points"
          chosen={view === "second"}
          onSelect={() => setView("second")}
        />
        <FloatMenuItem
          label="Break points"
          description="4 points"
          chosen={view === "bp"}
          onSelect={() => setView("bp")}
        />
        <FloatMenuDivider />
        <FloatMenuItem
          label="Advanced filters…"
          trailing={<ChevronRight className="size-3" strokeWidth={1.5} />}
          onSelect={noop}
        />
      </FloatMenu>
    </div>
  );
}
