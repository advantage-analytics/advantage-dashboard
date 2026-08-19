import { redirect } from "next/navigation";

/**
 * Team settings live in the settings rail now, beside Profile and Plan, so
 * there is one place a person looks for anything called settings. The team
 * menu still points here, and this keeps that link — and any bookmark — working.
 */
export default function TeamSettingsRedirect() {
  redirect("/dashboard/settings/team");
}
