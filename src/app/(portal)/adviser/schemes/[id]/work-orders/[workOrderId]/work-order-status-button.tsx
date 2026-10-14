"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { updateWorkOrderStatusAction } from "../actions";

export function WorkOrderStatusButton({
  schemeId,
  workOrderId,
  currentStatus,
}: {
  schemeId: string;
  workOrderId: string;
  currentStatus: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleStatusChange(newStatus: string) {
    startTransition(async () => {
      await updateWorkOrderStatusAction(schemeId, workOrderId, newStatus);
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {currentStatus === "OPEN" && (
        <Button
          onClick={() => handleStatusChange("IN_PROGRESS")}
          disabled={isPending}
        >
          {isPending ? "Updating..." : "Start Work"}
        </Button>
      )}
      {(currentStatus === "OPEN" || currentStatus === "IN_PROGRESS") && (
        <>
          <Button
            variant="secondary"
            onClick={() => handleStatusChange("COMPLETED")}
            disabled={isPending}
          >
            {isPending ? "Updating..." : "Mark Completed"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => handleStatusChange("CANCELLED")}
            disabled={isPending}
          >
            {isPending ? "Updating..." : "Cancel"}
          </Button>
        </>
      )}
    </div>
  );
}
