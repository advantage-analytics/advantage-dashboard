import type { CSSProperties } from "react";
import Link from "next/link";
import type {
  AskSourceMatch,
  AskTreeBranch,
  AskTreeVisual,
} from "@/lib/services/ask/events";
import { watchHref } from "@/lib/services/ask/figure-video";
import { cn } from "@/lib/utils";
import { barWidth, type TreeNode, treeLayout } from "./visual-geometry";
import { ROW_LABEL, VisualFrame, WATCH_ROW, WatchMark } from "./visual-frame";

const SHARE = "var(--viz-you)";

/** The label column at the root; each level down gives up its indent. */
const LABEL_WIDTH = 156;
/** One level's indent: the hairline's 6px margin plus its 12px padding. */
const INDENT = 18;

/** The figure columns: the count, the part when there is one, the share. */
const columnsFor = (depth: number, hasPart: boolean) =>
  `${Math.max(LABEL_WIDTH - depth * INDENT, 72)}px minmax(0,1fr) 44px${hasPart ? " 40px" : ""} 52px`;

/**
 * A play tree: the serve +1 breakdown's patterns, or the plays, as
 * branches under their first step — "T serve", then each +1 under it — each
 * leaf with a bar for its share (the points won, the shots missed) and its
 * cells beside it in the server's own text. The steps shared by several
 * branches are drawn once, so twelve rows read as a tree of four, and the
 * hairline down each group is the branch line.
 *
 * The cells stand in right-aligned columns named once at the top (the
 * count, the part, the share), so every track ends at the same x and the
 * figures scan down a line; each level's label column gives up its indent
 * so the tracks start together too. The share is the column the bar draws,
 * so it reads in full ink.
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
  const hasPart = Boolean(visual.partLabel);
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
        style={
          {
            "--ask-row": node.branch,
            gridTemplateColumns: columnsFor(depth, hasPart),
          } as CSSProperties
        }
        className={cn("grid min-h-[30px] items-center gap-x-3", WATCH_ROW)}
      >
        {href ? (
          <Link
            href={href}
            data-ask-tree-watch=""
            className={cn(
              "group flex items-center rounded-[var(--radius-element)] transition-colors duration-[var(--duration-hover)] outline-none hover:text-[var(--ink-900)] focus-visible:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)]",
              ROW_LABEL,
            )}
          >
            {node.label}
            <WatchMark />
          </Link>
        ) : (
          <span className={ROW_LABEL}>{node.label}</span>
        )}
        <span
          aria-hidden="true"
          className="h-1.5 min-w-0 overflow-hidden rounded-[3px] bg-[var(--ink-100)]"
        >
          <span
            data-ask-grow=""
            className="block h-full rounded-[3px]"
            style={{
              width: `${barWidth(branch.share.value)}%`,
              background: SHARE,
            }}
          />
        </span>
        <BranchFigures visual={visual} branch={branch} />
      </li>
    );
  };
  const group = (node: TreeNode, depth: number) => (
    <li
      key={`${depth}-${node.label}`}
      data-ask-tree-group=""
      className="flex flex-col gap-1"
    >
      <span className="text-[12px] font-medium text-[var(--ink-900)]">
        {node.label}
      </span>
      <ul className="m-0 ml-1.5 flex list-none flex-col border-l border-[var(--border-hairline)] p-0 pl-3">
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
      <div className="flex max-w-[600px] flex-col gap-2">
        {/* The figure columns' names, once, over the root's columns. */}
        <div
          aria-hidden="true"
          className="grid items-end gap-x-3 text-right text-[11px] text-[var(--ink-600)]"
          style={{ gridTemplateColumns: columnsFor(0, hasPart) }}
        >
          <span />
          <span />
          <span>{visual.countLabel}</span>
          {hasPart && <span>{visual.partLabel}</span>}
          <span>{visual.shareLabel}</span>
        </div>
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {nodes.map((node) =>
            node.branch !== undefined ? leaf(node, 0) : group(node, 0),
          )}
        </ul>
      </div>
      <p className="sr-only">
        {visual.levels.join(", then ")}: {visual.branches.length}{" "}
        {visual.branches.length === 1 ? "branch" : "branches"}, most played
        first.
      </p>
    </VisualFrame>
  );
}

/**
 * The branch's cells, one per column: the count and the part quiet, the
 * share in full ink. Each is named for a screen reader, since the column
 * heads are drawn for the eye alone.
 */
function BranchFigures({
  visual,
  branch,
}: {
  visual: AskTreeVisual;
  branch: AskTreeBranch;
}) {
  const cell = "text-right text-[12px] whitespace-nowrap tabular-nums";
  return (
    <>
      <span data-ask-after="" className={cn(cell, "text-[var(--ink-500)]")}>
        <span className="sr-only">{visual.countLabel} </span>
        {branch.count.text}
      </span>
      {visual.partLabel && (
        <span data-ask-after="" className={cn(cell, "text-[var(--ink-500)]")}>
          <span className="sr-only">{visual.partLabel} </span>
          {branch.part?.text ?? ""}
        </span>
      )}
      <span
        data-ask-after=""
        className={cn(cell, "text-[13px] font-medium text-[var(--ink-900)]")}
      >
        <span className="sr-only">{visual.shareLabel} </span>
        {branch.share.text}
      </span>
    </>
  );
}
