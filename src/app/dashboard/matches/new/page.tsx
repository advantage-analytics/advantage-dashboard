import type { Metadata } from "next";
import { UploadMatchFlow } from "@/components/dashboard/matches/new-match-wizard/UploadMatchFlow";

export const metadata: Metadata = {
  title: "New match",
};

export default function NewMatchPage(): React.JSX.Element {
  return <UploadMatchFlow />;
}
