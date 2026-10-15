import { ClaimShell, ClaimHeading } from "@/components/claim/claim-shell";
import { ProgramMark } from "@/components/claim/program-mark";

/**
 * The chrome every join screen shares.
 *
 * Lifted out of `/join/[token]/page.tsx`, where it was private, because
 * `NothingSent` moved out of that file and the signed-in surfaces draw the same
 * frame. One rule: the pane is chrome only — it never decides which state is
 * being shown, so it stays a server component with no state of its own and can
 * be rendered from any route that needs the frame.
 *
 * The ✕ is `ClaimShell`'s default, `/claim/exit`, which resolves against the
 * session: the dashboard for someone signed in, the marketing home otherwise.
 * A bare `/` here dropped a signed-in person who declined an invitation from
 * the header onto the marketing home, and the pages that noticed had started
 * rebuilding this shell by hand to avoid it.
 *
 * `aside` is `ClaimShell`'s own slot: the screens that ask for a decision put
 * what it means beside it (`JoinTermsPanel`) rather than above the button, and
 * the pane lays out two-sided when one is passed. `mark` is the
 * program's name, drawn as the team mark the sidebar draws for a workspace —
 * the initial on ink — above the heading, so a link opened from a group chat
 * says whose it is before a word is read.
 */
export function JoinPane({
  width = 720,
  eyebrow,
  title,
  body,
  mark,
  crestUrl,
  aside,
  children,
}: {
  width?: 440 | 720;
  eyebrow?: string;
  title: string;
  body?: React.ReactNode;
  /** The program's name. Its initial is drawn as the team mark. */
  mark?: string;
  /** The program's crest, drawn in place of the initial when it has one. */
  crestUrl?: string | null;
  aside?: React.ReactNode;
  children?: React.ReactNode;
}) {
  // `ClaimShell` supplies the centre column itself, so nothing is stacked
  // inside a second one here.
  return (
    <ClaimShell
      // 720 with the 300 panel, not the claim screens' 840/340. Those carry a
      // form in the left column that fills it; here the left column is a
      // heading, a sentence and a button row, and at 840 the buttons ended
      // 220px short of the panel — two blocks on one page rather than one
      // decision with its terms beside it.
      width={aside ? 720 : width}
      gap={20}
      exitLabel="Leave"
      aside={aside}
      asideWidth={300}
    >
      {mark && <ProgramMark name={mark} crestUrl={crestUrl} />}
      <ClaimHeading
        gap={2}
        eyebrow={eyebrow}
        title={title}
        titlePadTop={8}
        body={body}
        bodyMax="58ch"
      />
      {children}
    </ClaimShell>
  );
}
