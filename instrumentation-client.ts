import posthog from "posthog-js";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

// Optional: without both values the app runs with PostHog off.
if (!projectToken || !apiHost) {
  if (process.env.NODE_ENV === "development") {
    console.warn(
      "[posthog] PostHog is off: set NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN and NEXT_PUBLIC_POSTHOG_HOST to enable it (see .env.example).",
    );
  }
} else {
  posthog.init(projectToken, {
    api_host: apiHost,
    defaults: "2026-01-30",
    capture_exceptions: true,
    debug: process.env.NODE_ENV === "development",

    // Privacy. The dashboard shows athletes' names, photos and performance
    // data — some of them minors on high-school and club programs — and none
    // of it is needed to understand how the product is used. Replays keep
    // layout, clicks and errors; the content stays in Supabase.
    session_recording: {
      maskAllInputs: true,
      // Every text node renders as asterisks in the replay.
      maskTextSelector: "*",
      // Profile photos and program crests become grey placeholders.
      blockSelector: "img",
    },
    // Autocapture records that a roster row was clicked, not whose name it held.
    mask_all_text: true,
    mask_all_element_attributes: true,
    // Console output is attached to replays unmasked, and the app logs ids and
    // Supabase errors there.
    enable_recording_console_log: false,
    // Auth links carry one-time credentials in the query string, and every
    // pageview records the URL.
    mask_personal_data_properties: true,
    custom_personal_data_properties: [
      "token",
      "token_hash",
      "code",
      "access_token",
      "refresh_token",
    ],
  });
}
