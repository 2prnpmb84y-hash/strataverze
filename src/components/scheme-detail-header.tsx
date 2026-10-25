"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ImageGallery } from "@/components/ui/image-gallery";
import { StaticMap } from "@/components/ui/static-map";
import { Pill } from "@/components/ui/pill";
import { isNavItemActive, type SchemeNavItem } from "@/lib/navigation/scheme-nav";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type SchemeImage = {
  id: string;
  url: string;
  caption?: string | null;
};

type PropertyDetail = {
  label: string;
  value: string | number | null | undefined;
};

export type SchemeDetailHeaderProps = {
  /** Back navigation (the chevron) */
  backHref: string;
  backLabel?: string;
  /** Plan number, shown in the badge, e.g. "SP 12345" */
  planNumber: string;
  /** Address heading, e.g. "42 Harbour Street, Sydney NSW 2000" */
  addressLine: string;
  /** Address used for the map embed */
  fullAddress: string;
  /** Scheme facts, shown as cards in one row */
  details: PropertyDetail[];
  /** Images for the photo area */
  images: SchemeImage[];
  /** Optional control over the photo area, such as "Add photo" for the Adviser. */
  photoAction?: React.ReactNode;
  /** Section navigation pills, in display order */
  navButtons: SchemeNavItem[];
  /**
   * Force the active pill by href. When omitted, the active pill is worked out
   * from the current URL, so it stays correct on every page within the scheme.
   */
  activeHref?: string;
};

/* ------------------------------------------------------------------ */
/*  Back chevron                                                       */
/* ------------------------------------------------------------------ */

function BackChevron() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="shrink-0" aria-hidden="true">
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
/*  Component                                                          */
/*  Layout follows the approved scheme design:                         */
/*  1. back chevron + plan number badge + address heading              */
/*  2. photo area and map, side by side                                */
/*  3. five scheme fact cards in one row                               */
/*  4. section navigation pills                                        */
/* ------------------------------------------------------------------ */

export function SchemeDetailHeader({
  backHref,
  backLabel = "Back",
  planNumber,
  addressLine,
  fullAddress,
  details,
  images,
  photoAction,
  navButtons,
  activeHref,
}: SchemeDetailHeaderProps) {
  const pathname = usePathname() ?? "";

  return (
    <div className="mb-6">
      {/* 1. Back chevron + plan number badge + address heading */}
      <div className="flex items-center gap-4 mb-5">
        <Link
          href={backHref}
          className="inline-flex items-center text-ink-muted hover:text-turquoise transition-colors"
          aria-label={backLabel}
        >
          <BackChevron />
        </Link>
        <div className="min-w-0">
          <span className="inline-flex items-center rounded-full bg-turquoise/15 px-2.5 py-0.5 text-xs font-medium text-ink">
            {planNumber}
          </span>
          <h1 className="mt-1.5 text-xl font-semibold font-heading text-ink">
            {addressLine}
          </h1>
        </div>
      </div>

      {/* 2. Photo area and map, side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
        <div className="relative">
          <ImageGallery
            images={images}
            className="h-64 w-full rounded-[var(--radius-card)] overflow-hidden"
          />
          {photoAction && <div className="absolute right-3 top-3">{photoAction}</div>}
        </div>
        <StaticMap
          address={fullAddress}
          className="h-64 w-full rounded-[var(--radius-card)] overflow-hidden"
        />
      </div>

      {/* 3. Scheme facts, one card each */}
      <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
        {details.map((detail) => (
          <div
            key={detail.label}
            className="rounded-[var(--radius-card)] border border-line bg-white px-4 py-3"
          >
            <dt className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-muted">
              {detail.label}
            </dt>
            <dd className="mt-1 text-sm font-medium text-ink">
              {detail.value ?? "—"}
            </dd>
          </div>
        ))}
      </dl>

      {/* 4. Section navigation: peach section row, then mint row with plus icons */}
      <nav aria-label="Scheme sections" className="flex flex-col gap-3">
        {(["section", "action"] as const).map((tone) => {
          const row = navButtons.filter((btn) => (btn.tone ?? "section") === tone);
          if (row.length === 0) return null;
          return (
            <div key={tone} className="flex flex-wrap gap-3">
              {row.map((btn) => {
                const isActive = activeHref
                  ? activeHref === btn.href
                  : isNavItemActive(btn, pathname);
                return (
                  <Pill key={btn.label} variant={tone} selected={isActive} href={btn.href}>
                    {btn.label}
                  </Pill>
                );
              })}
            </div>
          );
        })}
      </nav>
    </div>
  );
}

/** Same footprint as the header, shown while scheme data streams in. */
export function SchemeDetailHeaderSkeleton() {
  return (
    <div className="mb-6 animate-pulse" aria-hidden="true">
      <div className="flex items-center gap-4 mb-5">
        <div className="h-6 w-6 rounded bg-line" />
        <div>
          <div className="h-5 w-20 rounded-full bg-line" />
          <div className="mt-2 h-6 w-72 rounded bg-line" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
        <div className="h-64 rounded-[var(--radius-card)] bg-line/60" />
        <div className="h-64 rounded-[var(--radius-card)] bg-line/60" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-[66px] rounded-[var(--radius-card)] bg-line/60" />
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {[6, 3].map((count, r) => (
          <div key={r} className="flex flex-wrap gap-3">
            {Array.from({ length: count }).map((_, i) => (
              <div key={i} className="h-10 w-[150px] rounded-full bg-line/60" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
