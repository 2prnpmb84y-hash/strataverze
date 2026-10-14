"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { deleteBylawAction } from "../actions";

export function DeleteBylawButton({
  schemeId,
  bylawId,
}: {
  schemeId: string;
  bylawId: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    await deleteBylawAction(schemeId, bylawId);
  }

  if (!confirming) {
    return (
      <Button variant="danger" onClick={() => setConfirming(true)}>
        Delete By-law
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-red-600">Are you sure?</span>
      <Button variant="danger" onClick={handleDelete} disabled={deleting}>
        {deleting ? "Deleting..." : "Yes, Delete"}
      </Button>
      <Button variant="ghost" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </div>
  );
}
