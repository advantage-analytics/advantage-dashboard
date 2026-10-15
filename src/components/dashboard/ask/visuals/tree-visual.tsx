import type { CSSProperties } from "react";
import Link from "next/link";
import type {
  AskSourceMatch,
  AskTreeBranch,
  AskTreeVisual,
} from "@/lib/services/ask/events";
import { watchHref } from "@/lib/services/ask/figure-video";
import { barWidth, type TreeNode, treeLayout } from "./visual-geometry";
import { VisualFrame, VisualKey, WatchMark } from "./visual-frame";

const SHARE = "var(--viz-you)";

/**
 * A play tree: the serve +1 breakdown's patterns, or the plays, as
 * branches under their first step — "T serve", then each +1 under it — each
 * leaf with a bar for its share (the points won, the shots missed) and its
 * counts beside, in the server's own text. The steps shared by several
 * branches are drawn once, so twelve rows read as a tree of four, and the
 * hairline down each group is the branch line.
 *
 * Nothing here is a number of the component's own: the bar is geometry over
 * the share cell, the counts are printed as sent. Over one source match, a
 * leaf whose branch carries a filter (`watch`) is a link to that match's
 * film on exactly the points it counted (`tree.ts`, `figure-video.ts`).
 */
export function TreeVisual({
  visual,
  sources,
}: {
  visual: AskTreeVisual;
  sources?: readonly AskSourceMatch[] | null;
}) {
  const matchId = sources?.length === 1 ? sources[0].matchId : null;
  const nodes = treeLayout(visual.branches);
  const leaf = (node: TreeNode, depth: number) => {
    const branch = visual.branches[node.branch ?? -1];
    if (!branch) return null;
    const href =
      matchId && branch.watch ? watchHref(matchId, branch.watch) : null;
    return (
      <li
        key={`${depth}-${node.branch}`}
        data-ask-tree-branch=""
        data-ask-row=""
        // The branches arrive in the order they were written — most played
        // first — whichever group each lands in.
        style={{ "--ask-row": node.branch } as CSSProperties}

        className="grid grid-cols-[minmax(0,168px)_minmax(0,1fr)] items-center gap-x-4"
      >
        {href ? (
          <Link
            href={href}
            data-ask-tree-watch=""
            className="group rounded-[var(--radius-element)] text-[12px] text-[var(--ink-700)] transition-colors duration-[var(--duration-hover)] outline-none hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)]"
          >
            {node.label}
            <WatchMark />
          </Link>
        ) : (
          <span className="text-[12px] text-[var(--ink-700)]">
            {node.label}
          </span>
        )}
        <span className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="h-1.5 min-w-0 flex-1 rounded-[1px] bg-[var(--ink-100)]"
          >
            <span
              data-ask-grow=""
              className="block h-full rounded-[1px]"
              style={{
                width: `${barWidth(branch.share.value)}%`,
                background: SHARE,
              }}
            />
          </span>
          <span
            data-ask-after=""
            className="shrink-0 text-right text-[11px] whitespace-nowrap text-[var(--ink-500)] tabular-nums"
          >
            <BranchFigures visual={visual} branch={branch} />
          </span>
        </span>
      </li>
    );
  };
  const group = (node: TreeNode, depth: number) => (
    <li
      key={`${depth}-${node.label}`}
      data-ask-tree-group=""
      className="flex flex-col gap-1.5"
    >
      <span className="text-[12px] text-[var(--ink-900)]">{node.label}</span>
      <ul className="m-0 ml-1.5 flex list-none flex-col gap-2 border-l border-[var(--border-hairline)] p-0 pl-3">
        {node.children.map((child) =>
          child.branch !== undefined
            ? leaf(child, depth + 1)
            : group(child, depth + 1),
        )}
      </ul>
    </li>
  );

  return (
    <VisualFrame kind="tree" caption={visual.caption}>
      <VisualKey
        items={[{ label: `${visual.shareLabel}, as a share`, color: SHARE }]}
      />
      <ul className="m-0 flex max-w-[520px] list-none flex-col gap-3.5 p-0">
        {nodes.map((node) =>
          node.branch !== undefined ? leaf(node, 0) : group(node, 0),
        )}
      </ul>
      <p className="sr-only">
        {visual.levels.join(", then ")}: {visual.branches.length}{" "}
        {visual.branches.length === 1 ? "branch" : "branches"}, most played
        first.
      </p>
    </VisualFrame>
  );
}

/** "29 points · 14 won · 48.3%": the branch's cells, each named by the series. */
function BranchFigures({
  visual,
  branch,
}: {
  visual: AskTreeVisual;
  branch: AskTreeBranch;
}) {
  return (
    <>
      <span className="text-[var(--ink-900)]">{branch.count.text}</span>{" "}
      {visual.countLabel.toLowerCase()}
      {branch.part && visual.partLabel && (
        <>
          {" · "}
          <span className="text-[var(--ink-900)]">{branch.part.text}</span>{" "}
          {visual.partLabel.toLowerCase()}
        </>
      )}
      {" · "}
      <span className="sr-only">{visual.shareLabel} </span>
      <span className="text-[var(--ink-900)]">{branch.share.text}</span>
    </>
  );
}
