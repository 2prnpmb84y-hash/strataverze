"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { startRenewalAction } from "../renewals/actions";

export function StartRenewalButton({
  schemeId,
  policyId,
}: {
  schemeId: string;
  policyId: string;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="primary"
      disabled={pending}
      onClick={() => start(() => startRenewalAction(schemeId, policyId))}
    >
      {pending ? "Starting..." : "Start a renewal"}
    </Button>
  );
}
