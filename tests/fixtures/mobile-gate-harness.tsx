import { createRoot } from "react-dom/client";
import { MobileGate } from "@/components/dashboard/mobile-gate";

// `?only=1` mounts the gate as /admin and /label do.
const mountOnlyWhenShown = window.location.search.includes("only=1");

createRoot(document.getElementById("root")!).render(
  <main className="p-6">
    <h1>Match report behind the gate</h1>
    <MobileGate mountOnlyWhenShown={mountOnlyWhenShown} />
  </main>,
);
