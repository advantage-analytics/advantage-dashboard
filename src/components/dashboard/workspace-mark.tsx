import { cn } from "@/lib/utils";
import type { Workspace } from "@/lib/workspace/types";

/**
 * A workspace's square: the program's crest when it has one, otherwise the
 * letter on ink (a team) or blue (personal).
 *
 * Size, radius and letter type come from the call site — the switcher row,
 * its menu and the upload wizard each draw it at their own scale.
 *
 * A crest is never a circle: the design system keeps circles for people.
 */
export function WorkspaceMark({
  workspace,
  className,
}: {
  workspace: Pick<Workspace, "kind" | "mark" | "crestUrl">;
  /** Size, radius and letter type, e.g. `size-[26px] rounded-[6px] text-[11px]`. */
  className?: string;
}) {
  if (workspace.kind === "team" && workspace.crestUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a ≤512 KB crest from a public bucket; next/image has no host allow-listed
      <img
        src={workspace.crestUrl}
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
