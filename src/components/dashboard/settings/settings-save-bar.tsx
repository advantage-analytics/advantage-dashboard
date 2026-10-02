"use client";

import { useEffect, useRef } from "react";
import { useUnsavedChanges } from "@/components/dashboard/settings/unsaved-changes-context";
import { SettingsButton } from "@/components/dashboard/settings/settings-button";

/**
 * The commit bar for the settings pages that hold a draft.
 *
 * Sticky at the bottom of the scroll container rather than pinned after the
 * last card, because the pages it serves are taller than the viewport: a Save
 * button that only exists once you have scrolled past the roster is a button
 * people do not press.
 *
 * It also owns the dirty flag. `UnsavedChangesProvider` is what makes the rail
 * and the browser ask before discarding work, and every page that grew its own
 * `setHasUnsavedChanges` effect was one page away from forgetting to clear it.
 */
export function SettingsSaveBar({
  isDirty,
  isSaving,
  onSave,
  onDiscard,
}: {
  isDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const { setHasUnsavedChanges } = useUnsavedChanges();

  useEffect(() => {
    setHasUnsavedChanges(isDirty);
    return () => setHasUnsavedChanges(false);
  }, [isDirty, setHasUnsavedChanges]);

  // `onSave` closes over the draft, so its identity changes on every keystroke.
  // Keeping it in a ref means the listener below is registered when the form
  // becomes dirty and not once per character typed.
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  // ⌘S saves. Registered only while there is something to save, so the page
  // never swallows the browser's own shortcut when it has nothing to do with it.
  useEffect(() => {
    if (!isDirty || isSaving) return;
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        event.preventDefault();
        onSaveRef.current();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isDirty, isSaving]);

  if (!isDirty && !isSaving) return null;

  return (
    <div className="sticky bottom-0 z-10 -mx-2 flex h-14 items-center gap-3 border-t border-[var(--border-hairline)] bg-[var(--surface-card)] px-2">
      <span
        aria-hidden="true"
        className="size-[3px] rounded-full bg-[var(--blue)]"
      />
      <span className="text-[11px] text-[var(--ink-600)]">
        {isSaving ? "Saving…" : "Unsaved changes"}
      </span>
      <div className="flex-1" />
      <SettingsButton variant="ghost" onClick={onDiscard} disabled={isSaving}>
        Discard
      </SettingsButton>
      <SettingsButton onClick={onSave} loading={isSaving}>
        Save changes
      </SettingsButton>
    </div>
  );
}
