import { PendingBar, PendingRegion } from "advantage-analytics-ds";

/** One `role="status"` per loading region; everything visual sits under an `aria-hidden` wrapper. */
export function InsightLoading() {
  return (
    <div style={{ maxWidth: 420 }}>
      <PendingRegion label="insight" innerClassName="flex flex-col gap-3">
        <div style={{ width: "30%" }}>
          <PendingBar />
        </div>
        <div style={{ width: "92%" }}>
          <PendingBar />
        </div>
        <div style={{ width: "76%" }}>
          <PendingBar />
        </div>
        <div style={{ display: "flex", gap: 20, marginTop: 6 }}>
          <PendingBar className="w-[72px]" />
          <PendingBar className="w-[72px]" />
          <PendingBar className="w-[72px]" />
        </div>
      </PendingRegion>
    </div>
  );
}
