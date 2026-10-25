import { redirect } from "next/navigation";

/**
 * Owners and the committee now report works through works requests, which
 * the committee decides by vote (works marketplace stage 1, 25 Oct 2026).
 * Earlier maintenance work orders stay on /owner/maintenance.
 */
export default function NewOwnerMaintenancePage() {
  redirect("/owner/works/new");
}
