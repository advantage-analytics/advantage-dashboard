"use client";

import { useCallback, useState } from "react";

/**
 * Keyboard movement over a flat list of options.
 *
 * The mechanically generic half of a listbox, with no design opinion in it: no
 * markup, no classes, no data shape. It exists because the roster's invite
 * picker needed arrow keys and `search-command-palette.tsx` already had them,
 * and a second hand-rolled copy of Arrow/Home/End/Enter/Escape is how the two
 * drift apart on which key does what.
 *
 * Deliberately NOT a Combobox component. The three list-like things in this app
 * — the wizard's roster picker, the schedule's opponent typeahead, and the
 * command palette — solve three different problems, and a generic component
 * designed against one consumer would be a guess about the other two. This is
 * the part they genuinely share.
 *
 * ── Using it ────────────────────────────────────────────────────────────────
 * Put `optionId(activeIndex)` in the input's `aria-activedescendant`, give each
 * rendered option that same id, and mark the active one `aria-selected`. The
 * hook never touches the DOM, so scrolling the active option into view is the
 * caller's job — it is the one part that depends on how the list is laid out.
 */
export function useListboxNav({
  count,
  open,
  onSelect,
  onDismiss,
  idPrefix,
}: {
  count: number;
  open: boolean;
  onSelect: (index: number) => void;
  onDismiss: () => void;
  /** Namespaces the generated option ids, so two lists on one page cannot collide. */
  idPrefix: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);

  // Reopening should not resume where the last visit left off, and a list that
  // shrank under the cursor must not leave the cursor past its end.
  //
  // Adjusted DURING render rather than in an effect. React handles a setState
  // in the render body by re-running the component before committing, so the
  // list never paints with a stale cursor — where an effect would paint once
  // wrong and then correct itself. It is also what the lint rule asks for.
  const key = `${open}:${count}`;
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setActiveIndex(0);
  }

  const optionId = useCallback(
    (index: number) => `${idPrefix}-option-${index}`,
    [idPrefix]
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!open || count === 0) return;

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          // Wraps. A list this short is faster to circle than to reverse.
          setActiveIndex((i) => (i + 1) % count);
          break;
        case "ArrowUp":
          event.preventDefault();
          setActiveIndex((i) => (i - 1 + count) % count);
          break;
        case "Home":
          event.preventDefault();
          setActiveIndex(0);
          break;
        case "End":
          event.preventDefault();
          setActiveIndex(count - 1);
          break;
        case "Enter":
          event.preventDefault();
          onSelect(activeIndex);
          break;
        case "Escape":
          event.preventDefault();
          onDismiss();
          break;
        default:
          break;
      }
    },
    [open, count, activeIndex, onSelect, onDismiss]
  );

  return { activeIndex, setActiveIndex, optionId, onKeyDown };
}
