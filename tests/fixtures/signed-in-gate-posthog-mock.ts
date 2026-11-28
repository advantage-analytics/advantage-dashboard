/** posthog-js for the signed-in gate harness: records `reset()` beside the auth calls. */
import { record } from "./signed-in-gate-supabase-mock";

const posthog = {
  reset() {
    record("posthog.reset");
  },
};

export default posthog;
