import { useState } from "react";
import {
  DateField,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SettingsButton,
  SettingsField,
  SettingsUnderlineInput,
} from "advantage-analytics-ds";

/** A form dialog: header, two captioned fields, the footer's Cancel and one primary. */
export function EditMatch() {
  const [opp, setOpp] = useState("Elena Vargas");
  const [date, setDate] = useState("2026-09-21");
  return (
    <Dialog open>
      <DialogContent
        style={{
          width: 440,
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--shadow-dropdown)",
          padding: 24,
          gap: 18,
        }}
      >
        <DialogHeader>
          <DialogTitle
            style={{
              textAlign: "left",
              fontSize: 16,
              fontWeight: 500,
              color: "var(--ink-900)",
            }}
          >
            Edit match
          </DialogTitle>
          <DialogDescription
            style={{
              textAlign: "left",
              marginTop: 4,
              fontSize: 12,
              color: "var(--ink-600)",
            }}
          >
            Changes apply to the match record only; the film and its statistics
            are untouched.
          </DialogDescription>
        </DialogHeader>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "16px 20px",
          }}
        >
          <SettingsField label="Opponent" required>
            <SettingsUnderlineInput
              value={opp}
              onChange={(e) => setOpp(e.target.value)}
            />
          </SettingsField>
          <SettingsField label="Played on" labelless>
            <DateField label="Played on" value={date} onChange={setDate} />
          </SettingsField>
        </div>
        <DialogFooter>
          <SettingsButton variant="outline" size="sm">
            Cancel
          </SettingsButton>
          <SettingsButton size="sm">Save changes</SettingsButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
