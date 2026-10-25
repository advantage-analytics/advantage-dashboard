"use server";

import { redirect } from "next/navigation";

import { applyUnsubscribe } from "@/lib/services/notifications/unsubscribe-action";

/** The button on `/email/unsubscribe`. POST only, so a mail scanner's GET of
 *  the link never turns anyone's mail off. */
export async function unsubscribeForm(formData: FormData) {
  const read = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : null;
  };
  const userId = read("u");
  const token = read("t");
  const outcome = await applyUnsubscribe(userId, token);

  // A failed write keeps the link, so the page can offer the button again
  // instead of calling a good link broken.
  const query = new URLSearchParams({ status: outcome });
  if (outcome === "failed" && userId && token) {
    query.set("u", userId);
    query.set("t", token);
  }
  redirect(`/email/unsubscribe?${query}`);
}
