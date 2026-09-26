import { DialogProblem } from "advantage-analytics-ds";

/** The error a dialog shows at the foot of its body. */
export function Refused() {
  return (
    <div style={{ maxWidth: 392 }}>
      <DialogProblem message="That email already belongs to a member of this program." />
    </div>
  );
}
