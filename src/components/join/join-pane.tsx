import { ClaimShell, ClaimHeading } from "@/components/claim/claim-shell";
import { WorkspaceMark } from "@/components/dashboard/workspace-mark";

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
 * the pane widens to the two-sided measure when one is passed. `mark` is the
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
  aside,
  children,
}: {
  width?: 440 | 720;
  eyebrow?: string;
  title: string;
  body?: React.ReactNode;
  /** The program's name. Its initial is drawn as the team mark. */
  mark?: string;
  aside?: React.ReactNode;
  children?: React.ReactNode;
}) {
  // `ClaimShell` supplies the centre column itself, so nothing is stacked
  // inside a second one here.
  return (
    <ClaimShell
      width={aside ? 840 : width}
      gap={20}
      exitLabel="Leave"
      aside={aside}
      asideWidth={340}
    >
      {mark && (
        <WorkspaceMark
          workspace={{
            kind: "team",
            mark: mark.trim().charAt(0).toUpperCase(),
            iconUrl: null,
          }}
          className="size-8 rounded-[var(--radius-button)] text-[12px]"
        />
      )}
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
