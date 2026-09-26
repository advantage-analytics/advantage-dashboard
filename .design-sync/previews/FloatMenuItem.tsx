import { ChevronRight, Flame, Pencil } from "lucide-react";
import {
  FloatMenuDivider,
  FloatMenuItem,
  FloatMenuNote,
} from "advantage-analytics-ds";

const surface = {
  display: "flex",
  flexDirection: "column",
  width: 232,
  padding: 5,
  borderRadius: 10,
  background: "var(--surface-card)",
  boxShadow: "0px 6px 20px 0px rgba(0,0,0,0.12)",
} as const;
const noop = () => {};

/** Omit `chosen` for an action row; `chosen={false}` keeps the check gutter for an unselected option. */
export function RowKinds() {
  return (
    <div role="menu" aria-label="Row kinds" style={surface}>
      <FloatMenuItem
        label="Edit match"
        icon={<Pencil className="size-3" strokeWidth={1.5} />}
        onSelect={noop}
      />
      <FloatMenuItem
        label="Advanced filters…"
        trailing={<ChevronRight className="size-3" strokeWidth={1.5} />}
        onSelect={noop}
      />
      <FloatMenuDivider />
      <FloatMenuItem
        label="Heat"
        description="Shot density on the court"
        icon={<Flame className="size-3" strokeWidth={1.5} />}
        chosen
        onSelect={noop}
      />
      <FloatMenuItem
        label="Points"
        description="Every shot as a dot"
        chosen={false}
        onSelect={noop}
      />
      <FloatMenuItem
        label="Trails"
        description="Coming with the winter build"
        chosen={false}
        disabled
        onSelect={noop}
      />
      <FloatMenuNote>Trails need the vendor&apos;s next model.</FloatMenuNote>
    </div>
  );
}
