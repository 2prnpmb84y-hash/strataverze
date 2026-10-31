"use client";

import { useEffect } from "react";
import { StatusPage, digestOf } from "@/components/status-page";

/**
 * An unexpected error outside the portal (AR-038). The error's message is
 * never shown; the digest is, so support can find it in the server logs.
 */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusPage
      title="Something went wrong"
      description="This page couldn't be loaded. Please try again. If it keeps happening, email support and quote the reference below."
      digest={digestOf(error)}
      retry={retry}
    />
  );
}
