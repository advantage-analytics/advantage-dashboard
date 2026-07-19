import { redirect } from "next/navigation";

// Access requests are captured by the landing page's form, which writes to
// Airtable. The old in-app application form never submitted anywhere, so this
// route now hands off to the single real intake.
export default function Page() {
  redirect("https://advantage-analytics.com/#access");
}
