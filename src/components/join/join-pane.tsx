import {
  ClaimShell,
  ClaimColumn,
  ClaimHeading,
} from "@/components/claim/claim-shell";

/**
 * The chrome every join screen shares.
 *
 * Lifted out of `/join/[token]/page.tsx`, where it was private, because
 * `NothingSent` moved out of that file and the signed-in surfaces draw the same
 * frame. One rule: the pane is chrome only — it never decides which state is
 * being shown, so it stays a server component with no state of its own and can
 * be rendered from any route that needs the frame.
 */
export function JoinPane({
  width = 720,
  eyebrow,
  title,
  body,
  children,
}: {
  width?: 440 | 720;
  eyebrow?: string;
  title: string;
  body?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <ClaimShell width={width} gap={20} exitHref="/" exitLabel="Leave">
      <ClaimColumn gap={20}>
        <ClaimHeading
          gap={2}
          eyebrow={eyebrow}
          title={title}
          titlePadTop={8}
          body={body}
          bodyMax="58ch"
        />
        {children}
      </ClaimColumn>
    </ClaimShell>
  );
}
