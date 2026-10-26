"use client";

import { X } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { LABEL_SHORTCUT_GROUPS } from "./label-shortcuts";

/**
 * The label console's shortcut sheet: every key it reads, in four groups
 * (`LABEL_SHORTCUT_GROUPS`), opened by ⌘ / or ? and by the rail header's
 * keyboard button. The DS Dialog in its light form — the white surface the
 * console's confirms already portal out to over the black view — at
 * `ConfirmDialog`'s geometry (16px title over a 12px contract sentence, a 28px
 * close, 24px inset), 560px wide for two columns. Each row is the Help
 * center's shortcut row: a 12px action, an optional 11px note, `Kbd` chips at
 * the right, hairlines between.
 *
 * Added 2026-10-26: the keys were otherwise only on the court's strip while
 * placing, and in tooltips.
 */
export function LabelShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        data-label-shortcuts=""
        className="gap-0 border-0 bg-[var(--surface-card)] p-0 outline-none sm:max-w-none"
        style={{
          width: "560px",
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "calc(100dvh - 64px)",
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--shadow-dropdown)",
        }}
      >
        <div className="flex min-h-0 flex-col gap-[18px] p-6 pb-5">
          <div className="flex items-start gap-2.5">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-left text-[16px] font-medium text-[var(--ink-900)]">
                Keyboard shortcuts
              </DialogTitle>
              <DialogDescription className="mt-1 text-left text-[12px] leading-[1.55] text-pretty text-[var(--ink-600)]">
                Shot keys act on the selected shot. A text field or an open menu
                keeps its own keys.
              </DialogDescription>
            </div>
            <DialogClose
              aria-label="Close"
              className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] transition-colors hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none touch:hit-area"
            >
              <X className="size-3.5" strokeWidth={1.5} aria-hidden />
            </DialogClose>
          </div>
          <div className="grid min-h-0 grid-cols-1 gap-x-7 gap-y-5 overflow-y-auto sm:grid-cols-2">
            {LABEL_SHORTCUT_GROUPS.map((group) => (
              <div
                key={group.label}
                data-shortcut-group={group.label}
                className="flex min-w-0 flex-col gap-1.5"
              >
                <span className="eyebrow">{group.label}</span>
                <dl className="flex flex-col">
                  {group.items.map((shortcut) => (
                    <div
                      key={shortcut.action}
                      className="flex items-center justify-between gap-4 border-b border-[var(--border-hairline)] py-1.5 last:border-b-0"
                    >
                      <dd className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-[12px] leading-[1.45] text-[var(--ink-900)]">
                          {shortcut.action}
                        </span>
                        {shortcut.note ? (
                          <span className="text-[11px] leading-[1.5] text-[var(--ink-500)]">
                            {shortcut.note}
                          </span>
                        ) : null}
                      </dd>
                      <dt className="flex shrink-0 items-center gap-1">
                        {shortcut.keys.map((key) => (
                          <Kbd key={key}>{key}</Kbd>
                        ))}
                      </dt>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[var(--ink-500)]">
            Use Ctrl instead of ⌘ on Windows and Linux.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
