/**
 * Every key the label console reads, as the shortcut sheet lists them
 * (`LabelShortcutsDialog`): the one place the keys are listed. The strip of
 * keys under the court went on 2026-10-26; the sheet replaced it.
 *
 * The handlers live in label-console.tsx (shot keys, ↑ ↓, enter, esc, the
 * flag walks, ⌘Z, ⌘⇧Z, ⌘ enter, ⌘ /) and label-video.tsx (D, L, M). Key legends
 * follow the DS `Kbd` conventions: word keys lowercase, letters uppercase,
 * arrows as glyphs, each key of a combo its own chip.
 */

export interface LabelShortcut {
  /** One chip per key, in the order they are pressed. */
  keys: readonly string[];
  action: string;
  /** A second line, where the action alone would not say it. */
  note?: string;
}

export interface LabelShortcutGroup {
  label: string;
  items: readonly LabelShortcut[];
}

export const LABEL_SHORTCUT_GROUPS: readonly LabelShortcutGroup[] = [
  {
    label: "Playback",
    items: [
      { keys: ["space"], action: "Play or pause" },
      { keys: ["←"], action: "Previous point" },
      { keys: ["→"], action: "Next point" },
      { keys: ["D"], action: "Skip dead time" },
      { keys: ["L"], action: "Loop the point" },
      { keys: ["M"], action: "Mute" },
    ],
  },
  {
    label: "Move around",
    items: [
      { keys: ["↑"], action: "Previous shot" },
      { keys: ["↓"], action: "Next shot" },
      { keys: ["enter"], action: "Open the playing point" },
      {
        keys: ["esc"],
        action: "Let go of the shot",
        note: "Plays the whole point. Again to fold it",
      },
      {
        keys: ["esc"],
        action: "Leave full screen",
        note: "Hold it, in Chrome or Edge. Elsewhere, the exit button",
      },
      { keys: ["]"], action: "Next score flag" },
      { keys: ["["], action: "Previous score flag" },
      { keys: ["'"], action: "Next data flag" },
      { keys: [";"], action: "Previous data flag" },
    ],
  },
  {
    label: "Selected shot",
    items: [
      { keys: ["F"], action: "Forehand" },
      { keys: ["B"], action: "Backhand" },
      { keys: ["V"], action: "Volley", note: "Again for a groundstroke" },
      { keys: ["O"], action: "Overhead" },
      { keys: ["S"], action: "Serve", note: "Again to switch 1st and 2nd" },
      {
        keys: ["1", "2", "3", "4"],
        action: "Spin",
        note: "Topspin, flat, backspin, sidespin",
      },
      { keys: ["C"], action: "Contact or landing" },
      { keys: ["X"], action: "Flip side" },
      {
        keys: ["H"],
        action: "Switch hitter",
        note: "To the other player. A serve may ask about the rest of the point",
      },
      { keys: ["T"], action: "Time to this frame" },
    ],
  },
  {
    label: "Edit",
    items: [
      { keys: ["A"], action: "Add shot after" },
      { keys: ["⇧", "A"], action: "Add shot before" },
      { keys: ["R"], action: "Reset shot" },
      { keys: ["⇧", "R"], action: "Reset point" },
      { keys: ["⌫"], action: "Delete shot" },
      { keys: ["⌘", "enter"], action: "Mark the point checked" },
      { keys: ["⌘", "Z"], action: "Undo" },
      { keys: ["⌘", "⇧", "Z"], action: "Redo" },
      { keys: ["⌘", "/"], action: "Show this sheet", note: "Or ?" },
    ],
  },
];

/**
 * Whether a key event asks for the sheet: ⌘ / (Ctrl / off a Mac), or ? on its
 * own — some browsers keep ⌘ / for themselves.
 */
export function isShortcutSheetKey(event: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}): boolean {
  if (event.altKey) return false;
  if (event.key === "/") return event.metaKey || event.ctrlKey;
  return event.key === "?" && !event.metaKey && !event.ctrlKey;
}
