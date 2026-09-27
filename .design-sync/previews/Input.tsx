import { Input, Label } from "advantage-analytics-ds";

const col = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  maxWidth: 280,
} as const;

/** The boxed input beside its label. */
export function WithLabel() {
  return (
    <div style={col}>
      <Label htmlFor="opp">Opponent</Label>
      <Input id="opp" defaultValue="Elena Vargas" />
    </div>
  );
}

export function Placeholder() {
  return (
    <div style={col}>
      <Label htmlFor="school">School</Label>
      <Input id="school" placeholder="Meridian State" />
    </div>
  );
}

/** `aria-invalid` turns the border and ring to the danger tint. */
export function Invalid() {
  return (
    <div style={col}>
      <Label htmlFor="email">Email</Label>
      <Input
        id="email"
        type="email"
        defaultValue="jordan@meridian"
        aria-invalid
      />
      <span style={{ fontSize: 11, color: "var(--danger)" }}>
        Enter a full email address.
      </span>
    </div>
  );
}

export function Disabled() {
  return (
    <div style={col}>
      <Label htmlFor="pid">Player id</Label>
      <Input id="pid" defaultValue="pl_8f2c1a" disabled />
    </div>
  );
}
