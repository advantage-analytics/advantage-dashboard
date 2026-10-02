"use client";

import { useCallback, useState } from "react";

/**
 * Makes a dialog's body part of its accessible description.
 *
 * Radix points `aria-describedby` at the `Description` alone — the one-line
 * contract under the title — so a screen reader opening a confirm hears the
 * contract and never the consequences under it, which are the reason the
 * dialog exists. This keeps Radix's own description id (read off the element,
 * so its missing-description check still finds it) and appends the body's.
 *
 * Spread `contentProps` on the dialog content, put `descriptionRef` on the
 * `Description`, and `bodyId` on the element holding the body. With no body,
 * `contentProps` is empty and Radix's default wiring stands.
 */
export function useDescribedBody(bodyId: string | undefined) {
  const [descriptionId, setDescriptionId] = useState<string | null>(null);
  const descriptionRef = useCallback((element: HTMLElement | null) => {
    setDescriptionId(element?.id ?? null);
  }, []);
  const contentProps =
    bodyId && descriptionId
      ? { "aria-describedby": `${descriptionId} ${bodyId}` }
      : {};
  return { descriptionRef, contentProps };
}
