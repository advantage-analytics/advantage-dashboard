/**
 * A paragraph as its sentences, so the prose can arrive a sentence at a time
 * (`ask-answer.tsx`) and still read exactly as it was written.
 *
 * A break falls after a full stop, a question mark or an exclamation mark
 * only when whitespace follows it — never inside "51.8%" or "6-3, 6-4",
 * where the mark is followed by a digit. Nothing is consumed: the whitespace
 * stays on the front of the sentence it leads into, so the pieces joined are
 * the paragraph, byte for byte. A paragraph with no such break — one still
 * streaming, or one with no closing mark — is a single piece.
 *
 * Pure, and in a file of its own so a spec can hold it without rendering.
 */
export function sentences(paragraph: string): string[] {
  return paragraph.split(/(?<=[.!?])(?=\s)/);
}
