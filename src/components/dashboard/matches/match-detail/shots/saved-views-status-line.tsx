/**
 * The line above the Saved cards: what just happened to a view, and its Undo
 * when there is one. Shared by the match report's wall (`saved-views-band.tsx`)
 * and the player profile's (`profile-visualizations-view.tsx`).
 */
export function SavedViewsStatusLine({
  status,
  onDismiss,
}: {
  status: { text: string; undo?: () => void };
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="text-micro flex items-center gap-1.5"
    >
      <span>{status.text}</span>
      {status.undo && (
        <button
          type="button"
          onClick={() => {
            const undo = status.undo;
            onDismiss();
            undo?.();
          }}
          className="cursor-pointer font-medium text-[var(--blue)] hover:text-[var(--blue-hover)]"
        >
          Undo
        </button>
      )}
    </div>
  );
}
