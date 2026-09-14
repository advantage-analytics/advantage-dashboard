import { cn } from "@/lib/utils";
import type { Workspace } from "@/lib/workspace/types";

/**
 * A workspace's square: the program's crest on a team, the viewer's profile
 * photo on personal, otherwise the letter on ink (a team) or blue (personal).
 *
 * Size, radius and letter type come from the call site — the switcher row,
 * its menu and the upload wizard each draw it at their own scale.
 *
 * Never a circle, even holding a face: the design system keeps circles for
 * people, and this is the workspace. The square says "workspace", the photo
 * says whose.
 */
export function WorkspaceMark({
  workspace,
  className,
}: {
  workspace: Pick<Workspace, "kind" | "mark" | "crestUrl" | "photoUrl">;
  /** Size, radius and letter type, e.g. `size-[26px] rounded-[6px] text-[11px]`. */
  className?: string;
}) {
  const imageUrl =
    workspace.kind === "team" ? workspace.crestUrl : workspace.photoUrl;

  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a small crest or avatar from a public bucket; next/image has no host allow-listed
      <img
        src={imageUrl}
        alt=""
        aria-hidden="true"
        className={cn(
          "shrink-0 bg-[var(--surface-subtle)] object-cover",
          className,
        )}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center font-medium text-white",
        workspace.kind === "team" ? "bg-[var(--ink-900)]" : "bg-[var(--blue)]",
        className,
      )}
    >
      {workspace.mark}
    </span>
  );
}
