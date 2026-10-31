"use client";

import { useEffect } from "react";
import { StatusPage, digestOf } from "@/components/status-page";
import { inter, poppins } from "./fonts";
import "./globals.css";

/**
 * An error in the root layout itself (AR-038). This replaces the layout,
 * so it renders its own <html> and <body> and loads the styles and fonts.
 * The error's message is never shown, only its digest.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en-AU" className={`${poppins.variable} ${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <title>Something went wrong | StrataVerze</title>
        <StatusPage
          title="Something went wrong"
          description="StrataVerze couldn't be loaded. Please try again. If it keeps happening, email support and quote the reference below."
          digest={digestOf(error)}
          retry={retry}
        />
      </body>
    </html>
  );
}
