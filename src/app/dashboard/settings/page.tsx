import { redirect } from "next/navigation";
import { SETTINGS_DEFAULT_HREF } from "@/lib/dashboard/nav";

export default function SettingsPage() {
  redirect(SETTINGS_DEFAULT_HREF);
}
