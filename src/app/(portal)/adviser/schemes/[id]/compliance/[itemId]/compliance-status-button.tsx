"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { updateComplianceStatusAction } from "../actions";

export function ComplianceStatusButton({
  schemeId,
  itemId,
  currentStatus,
}: {
  schemeId: string;
  itemId: string;
  currentStatus: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleStatus(status: string) {
    startTransition(async () => {
      await updateComplianceStatusAction(schemeId, itemId, status);
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {currentStatus !== "COMPLIANT" && (
        <Button
          variant="primary"
          onClick={() => handleStatus("COMPLIANT")}
          disabled={isPending}
        >
          {isPending ? "Updating..." : "Mark Compliant"}
        </Button>
      )}
      {currentStatus !== "NON_COMPLIANT" && (
        <Button
          variant="danger"
          onClick={() => handleStatus("NON_COMPLIANT")}
          disabled={isPending}
        >
          {isPending ? "Updating..." : "Mark Non-Compliant"}
        </Button>
      )}
      {currentStatus !== "EXPIRED" && (
        <Button
          variant="secondary"
          onClick={() => handleStatus("EXPIRED")}
          disabled={isPending}
        >
          {isPending ? "Updating..." : "Mark Expired"}
        </Button>
      )}
      {currentStatus !== "PENDING" && (
        <Button
          variant="ghost"
          onClick={() => handleStatus("PENDING")}
          disabled={isPending}
        >
          {isPending ? "Updating..." : "Reset to Pending"}
        </Button>
      )}
    </div>
  );
}
