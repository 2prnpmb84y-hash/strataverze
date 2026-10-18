"use client";

import Link from "next/link";
import { ImageGallery } from "@/components/ui/image-gallery";
import { StaticMap } from "@/components/ui/static-map";
import { Pill } from "@/components/ui/pill";

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
  /** Href of the currently active nav button (gets solid fill) */
  activeHref?: string;
};

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
      className="shrink-0 text-ink-muted"
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
  activeHref,
}: SchemeDetailHeaderProps) {
  return (
    <div className="mb-6">
      {/* ---- Header row: back arrow + plan number (left) | address (right) ---- */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div className="flex items-center gap-1.5">
          <Link
            href={backHref}
            className="inline-flex items-center text-ink hover:text-turquoise transition-colors"
            aria-label={backLabel}
          >
            <BackChevron />
          </Link>
          <h1 className="text-lg font-semibold font-heading text-ink">
            {planNumber}
          </h1>
        </div>

        {/* Address field in the header row */}
        <div className="flex items-center gap-2 rounded-[var(--radius-card)] border border-line bg-white px-3 py-2">
          <PinIcon />
          <span className="text-sm text-ink">{addressLine}</span>
        </div>
      </div>

      {/* ---- Two-column layout: photo (left) + details & map (right) ---- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
        {/* Left column: Photo carousel */}
        <ImageGallery
          images={images}
          className="aspect-[4/3] w-full rounded-[var(--radius-card)] overflow-hidden"
        />

        {/* Right column: Details grid + map */}
        <div className="flex flex-col gap-4">
          {/* Property details grid */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
            {details.map((detail) => (
              <div key={detail.label} className="flex items-center justify-between gap-2">
                <span className="text-sm text-ink-muted whitespace-nowrap">
                  {detail.label}
                </span>
                <span className="text-sm font-medium text-ink rounded-[var(--radius-card)] border border-line px-3 py-1 bg-white min-w-[3rem] text-center">
                  {detail.value ?? "—"}
                </span>
              </div>
            ))}
          </div>

          {/* Embedded map */}
          <StaticMap
            address={fullAddress}
            className="flex-1 min-h-[140px] rounded-[var(--radius-card)] overflow-hidden"
          />
        </div>
      </div>

      {/* ---- Navigation pills using Pill component ---- */}
      <div className="border-t-2 border-gold-line pt-4">
        <div className="flex flex-wrap gap-2.5">
          {navButtons.map((btn) => {
            const isActive = activeHref === btn.href;
            return (
              <Pill
                key={btn.label}
                variant="nav"
                selected={isActive}
                href={btn.href}
              >
                {btn.label}
              </Pill>
            );
          })}
        </div>
      </div>
    </div>
  );
}
