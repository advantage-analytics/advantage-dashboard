"use client";

import type { ReactElement } from "react";
import { Copy, Lock, Pencil, Trash2, Users } from "lucide-react";
import {
  FloatMenu,
  FloatMenuDivider,
  FloatMenuItem,
} from "@/components/ui/float-menu";
import {
  manageMenuRows,
  type ManageMenuRowKind,
} from "@/lib/data/saved-views-logic";
import type { ProgramRole, WorkspaceKind } from "@/lib/workspace/types";

const ROW_LABEL: Record<ManageMenuRowKind, string> = {
  rename: "Rename…",
  duplicate: "Duplicate",
  share: "Share with team",
  unshare: "Make private",
  delete: "Delete view",
};

const ROW_ICON: Record<ManageMenuRowKind, ReactElement> = {
  rename: <Pencil className="size-3" strokeWidth={1.5} aria-hidden="true" />,
  duplicate: <Copy className="size-3" strokeWidth={1.5} aria-hidden="true" />,
  share: <Users className="size-3" strokeWidth={1.5} aria-hidden="true" />,
  unshare: <Lock className="size-3" strokeWidth={1.5} aria-hidden="true" />,
  delete: <Trash2 className="size-3" strokeWidth={1.5} aria-hidden="true" />,
};

/**
 * The ⋯ tile menu (Task 9 Part B, Manage mode). Which rows it draws comes
 * straight from the pure `manageMenuRows` (`saved-views-logic.ts`) — this
 * component only supplies each row's label/icon and wires it to a handler.
 * Built on `ui/float-menu.tsx` per the design system's one-dropdown rule;
 * 188px, `role="menu"` (`FloatMenu`'s own wrapper).
 *
 * Delete is always last, in `--error`, after a divider — `manageMenuRows`
 * puts it last in its returned array, so the divider is drawn immediately
 * before whichever row happens to be "delete" rather than at a fixed index.
 */
export function ManageTileMenu({
  viewName,
  view,
  workspaceKind,
  role,
  open,
  onOpenChange,
  trigger,
  onRename,
  onDuplicate,
  onShare,
  onUnshare,
  onDelete,
}: {
  viewName: string;
  view: { mine: boolean; shared: boolean };
  workspaceKind: WorkspaceKind;
  role: ProgramRole;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactElement;
  onRename: () => void;
  onDuplicate: () => void;
  onShare: () => void;
  onUnshare: () => void;
  onDelete: () => void;
}) {
  const rows = manageMenuRows(view, { workspaceKind, role });

  function handlerFor(kind: ManageMenuRowKind): () => void {
    switch (kind) {
      case "rename":
        return onRename;
      case "duplicate":
        return onDuplicate;
      case "share":
        return onShare;
      case "unshare":
        return onUnshare;
      case "delete":
        return onDelete;
    }
  }

  return (
    <FloatMenu
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger}
      align="end"
      sideOffset={4}
      width={188}
      label={`Manage "${viewName}"`}
    >
      {rows.map((kind) => (
        <div key={kind}>
          {kind === "delete" && <FloatMenuDivider />}
          <FloatMenuItem
            label={ROW_LABEL[kind]}
            icon={ROW_ICON[kind]}
            onSelect={() => {
              onOpenChange(false);
              handlerFor(kind)();
            }}
            className={
              kind === "delete" ? "[&_span]:text-[var(--error)]" : undefined
            }
          />
        </div>
      ))}
    </FloatMenu>
  );
}
