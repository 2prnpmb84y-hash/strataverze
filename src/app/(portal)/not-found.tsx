import { StatusPage } from "@/components/status-page";

/** A wrong address inside the portal (AR-038): the same page as the app's, inside the portal frame. */
export default function PortalNotFound() {
  return (
    <StatusPage
      layout="inline"
      title="We can't find that page"
      description="The address may be mistyped, or the page may have moved or been removed."
    />
  );
}
