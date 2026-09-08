"use client";

// TEMPORARY preview route — outside /dashboard so it needs no session.
// Delete before `npm test`: tests/generate-map.spec.ts fails on an unlisted route.
// Frames the chooser the way the dashboard does: a 232px sidebar + 44px header.

import { StaticEventChooser } from "@/components/dashboard/schedule/static/static-event-chooser";

export default function ChooserPreview() {
  return (
    <div className="flex h-screen w-screen bg-[var(--surface-page)]">
      <aside
        data-fake-sidebar
        className="h-full w-[232px] shrink-0 border-r border-[var(--border-hairline)] bg-[var(--surface-card)]"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          data-fake-header
          className="h-11 shrink-0 border-b border-[var(--border-hairline)] bg-[var(--surface-card)]"
        />
        <main data-content-area className="flex min-h-0 flex-1 flex-col">
          <StaticEventChooser />
        </main>
      </div>
    </div>
  );
}
