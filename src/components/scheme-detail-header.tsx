"use client";

import Link from "next/link";
import { ImageGallery } from "@/components/ui/image-gallery";
import { StaticMap } from "@/components/ui/static-map";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type SchemeImage = {
  id: string;
  url: string;
  caption?: string | null;
};

type NavButton = {
  label: string;
  href: string;
};

type PropertyDetail = {
  label: string;
  value: string | number | null | undefined;
};

export type SchemeDetailHeaderProps = {
  /** Back navigation */
  backHref: string;
  backLabel?: string;
  /** Plan number shown as the main title */
  planNumber: string;
  /** Full address line: e.g. "7 Bortfield Drive, Chiswick, 2046" */
  addressLine: string;
  /** Full address for the map embed (including state) */
  fullAddress: string;
  /** Property details shown in the grid */
  details: PropertyDetail[];
  /** Images for the photo carousel */
  images: SchemeImage[];
  /** Navigation pill buttons */
  navButtons: NavButton[];
};

/* ------------------------------------------------------------------ */
/*  Circled plus icon (matches reference exactly)                      */
/* ------------------------------------------------------------------ */

function CircledPlusIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      className="shrink-0 text-primary-400"
    >
      <circle
        cx="9"
        cy="9"
        r="8"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M9 5.5v7M5.5 9h7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Back chevron                                                       */
/* ------------------------------------------------------------------ */

function BackChevron() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      className="shrink-0"
    >
      <path
        d="M15 18L9 12l6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Pin icon for address                                               */
/* ------------------------------------------------------------------ */

function PinIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className="shrink-0 text-muted-foreground"
    >
      <path
        d="M8 1.5A4.25 4.25 0 0 0 3.75 5.75C3.75 9.125 8 14.5 8 14.5s4.25-5.375 4.25-8.75A4.25 4.25 0 0 0 8 1.5Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="8"
        cy="5.75"
        r="1.5"
        stroke="currentColor"
        strokeWidth="1.25"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function SchemeDetailHeader({
  backHref,
  backLabel = "Back",
  planNumber,
  addressLine,
  fullAddress,
  details,
  images,
  navButtons,
}: SchemeDetailHeaderProps) {
  return (
    <div className="mb-6">
      {/* ---- Header row: back arrow + plan number (left) | address (right) ---- */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div className="flex items-center gap-1.5">
          <Link
            href={backHref}
            className="inline-flex items-center text-foreground hover:text-primary-400 transition-colors"
            aria-label={backLabel}
          >
            <BackChevron />
          </Link>
          <h1 className="text-lg font-semibold font-heading text-foreground">
            {planNumber}
          </h1>
        </div>

        {/* Address field in the header row */}
        <div className="flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2">
          <PinIcon />
          <span className="text-sm text-foreground">{addressLine}</span>
        </div>
      </div>

      {/* ---- Two-column layout: photo (left) + details & map (right) ---- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
        {/* Left column: Photo carousel */}
        <ImageGallery
          images={images}
          className="aspect-[4/3] w-full rounded-lg overflow-hidden"
        />

        {/* Right column: Details grid + map */}
        <div className="flex flex-col gap-4">
          {/* Property details grid — 2 columns of label + boxed value */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
            {details.map((detail) => (
              <div key={detail.label} className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {detail.label}
                </span>
                <span className="text-sm font-medium text-foreground rounded-md border border-border px-3 py-1 bg-white min-w-[3rem] text-center">
                  {detail.value ?? "—"}
                </span>
              </div>
            ))}
          </div>

          {/* Embedded map */}
          <StaticMap
            address={fullAddress}
            className="flex-1 min-h-[140px] rounded-lg overflow-hidden"
          />
        </div>
      </div>

      {/* ---- Navigation pill buttons — teal border, circled "+" icon ---- */}
      <div className="flex flex-wrap gap-2.5">
        {navButtons.map((btn) => (
          <Link
            key={btn.label}
            href={btn.href}
            className="inline-flex items-center gap-1.5 rounded-full border-2 border-primary-400 bg-white px-4 py-2 text-sm font-medium text-foreground hover:bg-primary-50 transition-colors"
          >
            <CircledPlusIcon />
            {btn.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
