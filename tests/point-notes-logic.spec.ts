import { expect, test } from "@playwright/test";
import {
  NOTE_MAX_LENGTH,
  TAG_MAX_LENGTH,
  noteAge,
  normalizeNoteBody,
  normalizeTagName,
  sameTagName,
  tagSuggestions,
} from "@/lib/data/point-notes-logic";

// The client's rules for the Video tab's point notes and tags. They mirror the
// CHECKs in `20261104021629_point_notes_and_tags.sql`, so a normalized value
// is never one the table refuses.

test("a note is trimmed, and nothing or too much is not sent", () => {
  expect(normalizeNoteBody("  split-step earlier  ")).toBe(
    "split-step earlier",
  );
  expect(normalizeNoteBody("   \n ")).toBeNull();
  expect(normalizeNoteBody("x".repeat(NOTE_MAX_LENGTH))).toHaveLength(
    NOTE_MAX_LENGTH,
  );
  expect(normalizeNoteBody("x".repeat(NOTE_MAX_LENGTH + 1))).toBeNull();
});

test("a tag name is trimmed with inner spaces collapsed, within 40 characters", () => {
  expect(normalizeTagName("  Net   approach ")).toBe("Net approach");
  expect(normalizeTagName("")).toBeNull();
  expect(normalizeTagName("x".repeat(TAG_MAX_LENGTH))).not.toBeNull();
  expect(normalizeTagName("x".repeat(TAG_MAX_LENGTH + 1))).toBeNull();
});

test("tag names compare the way the unique index does: case- and edge-space-blind", () => {
  expect(sameTagName("Footwork", " footwork ")).toBe(true);
  expect(sameTagName("Footwork", "Foot work")).toBe(false);
});

test("the picker leaves out applied tags and offers Create only for a new name", () => {
  const vocab = [
    { id: "1", name: "Footwork" },
    { id: "2", name: "Net approach" },
    { id: "3", name: "Pattern to repeat" },
  ];
  const applied = new Set(["2"]);
  expect(tagSuggestions(vocab, applied, "").matches.map((t) => t.id)).toEqual([
    "1",
    "3",
  ]);
  expect(tagSuggestions(vocab, applied, "foot")).toEqual({
    matches: [vocab[0]],
    canCreate: true,
  });
  // An exact (case-blind) name is the existing tag, not a new one — even one
  // already applied.
  expect(tagSuggestions(vocab, applied, "net approach").canCreate).toBe(false);
  expect(tagSuggestions(vocab, applied, "   ").canCreate).toBe(false);
});

test("a note's age reads in minutes, hours and days, then as a date", () => {
  const now = new Date("2026-11-03T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  expect(noteAge(ago(10_000), now)).toBe("just now");
  expect(noteAge(ago(5 * 60_000), now)).toBe("5 min ago");
  expect(noteAge(ago(60 * 60_000), now)).toBe("1 hour ago");
  expect(noteAge(ago(3 * 3600_000), now)).toBe("3 hours ago");
  expect(noteAge(ago(24 * 3600_000), now)).toBe("1 day ago");
  expect(noteAge(ago(2 * 86_400_000), now)).toBe("2 days ago");
  expect(noteAge(ago(30 * 86_400_000), now)).not.toMatch(/ago/);
  // A clock skewed into the future never reads as negative.
  expect(noteAge(new Date(now.getTime() + 60_000).toISOString(), now)).toBe(
    "just now",
  );
});
