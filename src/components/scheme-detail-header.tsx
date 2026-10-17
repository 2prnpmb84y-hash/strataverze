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
/*  Plus icon used inside each nav pill                                */
/* ------------------------------------------------------------------ */

function PlusIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className="shrink-0"
    >
      <path
        d="M7 2.5v9M2.5 7h9"
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
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      className="shrink-0"
    >
      <path
        d="M12.5 15L7.5 10l5-5"
        stroke="currentColor"
        strokeWidth="1.5"
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
      {/* ---- Header row: back arrow + plan number ---- */}
      <div className="flex items-center gap-2 mb-5">
        <Link
          href={backHref}
          className="inline-flex items-center text-foreground hover:text-primary-500 transition-colors"
          aria-label={backLabel}
        >
          <BackChevron />
        </Link>
        <h1 className="text-xl font-semibold font-heading text-foreground">
          {planNumber}
        </h1>
      </div>

      {/* ---- Two-column layout: photo + details/map ---- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
        {/* Left column: Photo carousel */}
        <ImageGallery
          images={images}
          className="aspect-[4/3] w-full"
        />

        {/* Right column: Address, details grid, map */}
        <div className="flex flex-col gap-4">
          {/* Address line */}
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5">
            <PinIcon />
            <span className="text-sm text-foreground">{addressLine}</span>
          </div>

          {/* Property details grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {details.map((detail) => (
              <div key={detail.label} className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {detail.label}
                </span>
                <span className="text-sm font-medium text-foreground rounded border border-border px-2.5 py-0.5 bg-card min-w-[3rem] text-center">
                  {detail.value ?? "—"}
                </span>
              </div>
            ))}
          </div>

          {/* Embedded map */}
          <StaticMap
            address={fullAddress}
            className="flex-1 min-h-[140px]"
          />
        </div>
      </div>

      {/* ---- Navigation pill buttons ---- */}
      <div className="flex flex-wrap gap-2.5">
        {navButtons.map((btn) => (
          <Link
            key={btn.label}
            href={btn.href}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary-300 bg-white px-4 py-2 text-sm font-medium text-foreground hover:bg-primary-50 hover:border-primary-400 transition-colors"
          >
            <PlusIcon />
            {btn.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
