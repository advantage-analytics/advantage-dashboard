import { Input, Label } from "advantage-analytics-ds";

/** Radix label: click focuses the control it names. */
export function WithInput() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        maxWidth: 280,
      }}
    >
      <Label htmlFor="ht">Hometown</Label>
      <Input id="ht" placeholder="Palo Alto, CA" />
    </div>
  );
}
