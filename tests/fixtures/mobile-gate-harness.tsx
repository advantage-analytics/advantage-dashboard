import { createRoot } from "react-dom/client";
import { MobileGate } from "@/components/dashboard/mobile-gate";

createRoot(document.getElementById("root")!).render(
  <main className="p-6">
    <h1>Match report behind the gate</h1>
    <MobileGate />
  </main>,
);
