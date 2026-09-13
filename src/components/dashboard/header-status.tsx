"use client";

/**
 * A one-line status a page can hand to the app header.
 *
 * The upload wizard needs to say "Draft saved" where the user is already
 * looking — the header — without the header knowing anything about wizards.
 * Null by default, so every route that never sets it renders exactly as before.
 */

import { createContext, useContext, useEffect, useMemo, useState } from "react";

interface HeaderStatusValue {
  status: string | null;
  setStatus: (status: string | null) => void;
}

const HeaderStatusContext = createContext<HeaderStatusValue>({
  status: null,
  setStatus: () => {},
});

export function HeaderStatusProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const value = useMemo(() => ({ status, setStatus }), [status]);
  return (
    <HeaderStatusContext.Provider value={value}>
      {children}
    </HeaderStatusContext.Provider>
  );
}

/** Read the current status. For the header itself. */
export function useHeaderStatus(): string | null {
  return useContext(HeaderStatusContext).status;
}

/**
 * Publish a status for as long as this component is mounted.
 *
 * Clears on unmount, so navigating away cannot strand "Draft saved" over an
 * unrelated page.
 */
export function usePublishHeaderStatus(status: string | null): void {
  const { setStatus } = useContext(HeaderStatusContext);
  useEffect(() => {
    setStatus(status);
    return () => setStatus(null);
  }, [status, setStatus]);
}
