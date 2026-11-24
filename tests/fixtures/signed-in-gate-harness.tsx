import { createRoot } from "react-dom/client";
import { SignedInGate } from "@/components/auth/signed-in-card";

const params = new URLSearchParams(window.location.search);
const mode = params.get("mode") === "sign-up" ? "sign-up" : "login";

createRoot(document.getElementById("root")!).render(
  <SignedInGate mode={mode} next={params.get("next") ?? undefined}>
    <form aria-label="Auth form">The normal form</form>
  </SignedInGate>,
);

document.documentElement.dataset.hydrated = "true";
