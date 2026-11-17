import { useState } from "react";
import { createRoot } from "react-dom/client";
import { DateField } from "@/components/ui/date-field";
import { DOB_MIN, todayUtc } from "@/app/onboarding/age";

/**
 * The onboarding name step's date of birth, with the props
 * `app/onboarding/onboarding-flow.tsx` passes, in a real browser with the
 * app's styles. `tests/date-field-year-select.spec.ts` bundles and drives it;
 * the chosen value is echoed into `#dob-value` so the spec reads what the
 * call site would receive.
 */
function Harness() {
  const [dob, setDob] = useState("");
  return (
    <div style={{ width: 320, padding: 24 }}>
      <DateField
        label="Date of birth"
        variant="form"
        value={dob}
        onChange={setDob}
        min={DOB_MIN}
        max={todayUtc()}
        yearSelect
        required
        className="w-full"
      />
      <output id="dob-value">{dob}</output>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
document.documentElement.dataset.hydrated = "true";
