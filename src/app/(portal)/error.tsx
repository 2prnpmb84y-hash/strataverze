"use client";

import { useEffect } from "react";
import { StatusPage, digestOf } from "@/components/status-page";

/**
 * An unexpected error inside the portal (AR-038). Besides Try again it
 * offers the dashboard, sign in and support, so it is never a dead end
 * (for example when the session ended). The message is never shown.
 */
export default function PortalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusPage
      layout="inline"
      title="Something went wrong"
      description="This page couldn't be loaded. Please try again. If it keeps happening, email support and quote the reference below."
      digest={digestOf(error)}
      retry={retry}
    />
  );
}
