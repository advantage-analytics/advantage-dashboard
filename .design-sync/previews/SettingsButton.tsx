import { SettingsButton } from "advantage-analytics-ds";

const row = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 10,
} as const;

/** Primary is blue and the only one per surface; outline and ghost hover to a surface wash, never to blue; danger only where something is lost. */
export function Variants() {
  return (
    <div style={row}>
      <SettingsButton>Save changes</SettingsButton>
      <SettingsButton variant="outline">Discard</SettingsButton>
      <SettingsButton variant="ghost">Reset password</SettingsButton>
      <SettingsButton variant="danger">Delete account</SettingsButton>
      <SettingsButton variant="danger-solid">Delete match</SettingsButton>
    </div>
  );
}

/** `md` 36px / 13px and `sm` 32px / 12px — the tiers fields share. */
export function Sizes() {
  return (
    <div style={row}>
      <SettingsButton size="md">Invite staff</SettingsButton>
      <SettingsButton size="sm">Invite staff</SettingsButton>
      <SettingsButton variant="outline" size="md">
        Cancel
      </SettingsButton>
      <SettingsButton variant="outline" size="sm">
        Cancel
      </SettingsButton>
    </div>
  );
}

/** Loading holds the label beside a spinner; disabled is half-opacity, never a recolour. */
export function LoadingAndDisabled() {
  return (
    <div style={row}>
      <SettingsButton loading>Saving…</SettingsButton>
      <SettingsButton disabled>Save changes</SettingsButton>
      <SettingsButton variant="outline" disabled>
        Discard
      </SettingsButton>
    </div>
  );
}
