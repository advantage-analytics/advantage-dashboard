import { useState } from "react";
import {
  AdvSwitch,
  MenuSelect,
  SettingsButton,
  SettingsCard,
  SettingsCardFootnote,
  SettingsCardRow,
  SettingsCardTitle,
  SettingsField,
  SettingsSectionHeading,
  SettingsUnderlineInput,
} from "advantage-analytics-ds";

/** A card of unrelated toggles: hairline rows, control on the right, footnote closing it. */
export function Preferences() {
  const [email, setEmail] = useState(true);
  const [digest, setDigest] = useState(false);
  const [units, setUnits] = useState<"mph" | "kmh">("mph");
  return (
    <div style={{ maxWidth: 520 }}>
      <SettingsCard>
        <SettingsCardTitle>Notifications</SettingsCardTitle>
        <SettingsCardRow
          className="mt-3"
          label="Email me when an analysis finishes"
          description="One message per match, sent to the address on your account."
          control={
            <AdvSwitch
              checked={email}
              onCheckedChange={setEmail}
              label="Email on analysis finished"
            />
          }
        />
        <SettingsCardRow
          label="Weekly digest"
          description="Every Monday: matches played, serve trends, one focus for the week."
          control={
            <AdvSwitch
              checked={digest}
              onCheckedChange={setDigest}
              label="Weekly digest"
            />
          }
        />
        <SettingsCardRow
          label="Serve speed"
          control={
            <MenuSelect
              label="Serve speed units"
              value={units}
              onChange={setUnits}
              options={[
                { value: "mph", label: "mph" },
                { value: "kmh", label: "km/h" },
              ]}
            />
          }
        />
        <SettingsCardFootnote>
          Changes apply the next time a match is analyzed.
        </SettingsCardFootnote>
      </SettingsCard>
    </div>
  );
}

/** A form card: numbered section heading, captioned underline fields, one primary. */
export function ProfileForm() {
  const [name, setName] = useState("Jordan Lee");
  const [hometown, setHometown] = useState("");
  const [hand, setHand] = useState<"right" | "left" | undefined>(undefined);
  return (
    <div style={{ maxWidth: 520 }}>
      <SettingsCard>
        <SettingsSectionHeading
          number="01"
          title="General information"
          note="Only your name is visible to teammates"
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "18px 24px",
            marginTop: 18,
          }}
        >
          <SettingsField label="Full name" required>
            <SettingsUnderlineInput
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </SettingsField>
          <SettingsField
            label="Hometown"
            hint="Optional — shown on your player profile."
          >
            <SettingsUnderlineInput
              value={hometown}
              placeholder="Palo Alto, CA"
              onChange={(e) => setHometown(e.target.value)}
            />
          </SettingsField>
          <SettingsField label="Plays" labelless>
            <MenuSelect
              label="Playing hand"
              variant="underline"
              value={hand}
              placeholder="Choose a hand"
              onChange={setHand}
              options={[
                { value: "right", label: "Right-handed" },
                { value: "left", label: "Left-handed" },
              ]}
            />
          </SettingsField>
          <SettingsField label="Player id">
            <SettingsUnderlineInput mono value="pl_8f2c1a" readOnly />
          </SettingsField>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            marginTop: 22,
          }}
        >
          <SettingsButton variant="outline" size="sm">
            Discard
          </SettingsButton>
          <SettingsButton size="sm">Save changes</SettingsButton>
        </div>
      </SettingsCard>
    </div>
  );
}

/** Title with trailing content, a figure row, and the footnote as the only rule. */
export function PlanFacts() {
  return (
    <div style={{ maxWidth: 520 }}>
      <SettingsCard>
        <SettingsCardTitle
          trailing={
            <SettingsButton variant="outline" size="sm">
              Manage plan
            </SettingsButton>
          }
        >
          Plan
        </SettingsCardTitle>
        <div style={{ display: "flex", gap: 40, marginTop: 16 }}>
          {[
            ["Match videos", "6 of 10"],
            ["Renews", "Oct 1"],
            ["Members", "14"],
          ].map(([k, v]) => (
            <div
              key={k}
              style={{ display: "flex", flexDirection: "column", gap: 4 }}
            >
              <span style={{ fontSize: 11, color: "var(--ink-600)" }}>{k}</span>
              <span
                className="tabular-nums"
                style={{
                  fontSize: 22,
                  lineHeight: 1.15,
                  fontWeight: 300,
                  letterSpacing: "-0.4px",
                  color: "var(--ink-900)",
                }}
              >
                {v}
              </span>
            </div>
          ))}
        </div>
        <SettingsCardFootnote>
          Unused match videos do not roll over.
        </SettingsCardFootnote>
      </SettingsCard>
    </div>
  );
}
