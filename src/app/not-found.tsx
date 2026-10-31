import type { Metadata } from "next";
import { StatusPage } from "@/components/status-page";

export const metadata: Metadata = {
  title: "Page not found | StrataVerze",
};

/** Any address the app does not have, outside the portal (AR-038). */
export default function NotFound() {
  return (
    <StatusPage
      title="We can't find that page"
      description="The address may be mistyped, or the page may have moved or been removed."
    />
  );
}
