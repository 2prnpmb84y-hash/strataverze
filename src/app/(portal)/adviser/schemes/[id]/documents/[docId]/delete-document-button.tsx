"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { deleteDocumentAction } from "../actions";

export function DeleteDocumentButton({
  schemeId,
  documentId,
  documentTitle,
}: {
  schemeId: string;
  documentId: string;
  documentTitle: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      await deleteDocumentAction(schemeId, documentId);
    });
  }

  if (!confirming) {
    return (
      <Button variant="danger" onClick={() => setConfirming(true)}>
        Delete Document
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <p className="text-sm text-red-600">
        Delete <strong>{documentTitle}</strong>? This cannot be undone.
      </p>
      <Button
        variant="danger"
        onClick={handleDelete}
        disabled={isPending}
      >
        {isPending ? "Deleting..." : "Confirm Delete"}
      </Button>
      <Button variant="ghost" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </div>
  );
}
