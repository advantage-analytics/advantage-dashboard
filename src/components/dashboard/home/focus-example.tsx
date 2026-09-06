/**
 * The Focus card before there is anything to focus on.
 *
 * The card's real anatomy, shown rather than described: the two-line claim at
 * title size, then the quiet line that says whose claim it will be. The
 * sentence is in quotation marks and the header carries an "Example" capsule,
 * so it is never mistaken for a finding about this account.
 *
 * `--ink-600` rather than a lighter grey. This line is meant to be read, so it
 * has to clear 4.5:1 at 16px; it is still a clear step down from the ink-900 a
 * real claim uses.
 *
 * No blurred or scrambled evidence run underneath. Nothing here stands in for
 * a number the engine has not computed — the example is one sentence a coach
 * could actually say, and the second line says plainly when the real one
 * arrives.
 */
export function FocusExample() {
  return (
    <>
      <span
        className="text-title"
        style={{ maxWidth: "30ch", color: "var(--ink-600)" }}
      >
        &ldquo;Second serves are deciding your losses.&rdquo;
      </span>
      <span
        className="text-micro"
        style={{ maxWidth: "36ch", textWrap: "pretty" }}
      >
        Yours arrives after your first match, in your own numbers.
      </span>
    </>
  );
}
