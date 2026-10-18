"use client";

import { useState } from "react";

type GalleryImage = {
  id: string;
  url: string;
  caption?: string | null;
};

export function ImageGallery({
  images,
  className = "",
}: {
  images: GalleryImage[];
  className?: string;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (images.length === 0) {
    return (
      <div
        className={`relative overflow-hidden rounded-[var(--radius-card)] bg-muted flex items-center justify-center ${className}`}
      >
        <div className="text-center p-8">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            className="mx-auto text-ink-muted/40 mb-3"
          >
            <rect
              x="3"
              y="3"
              width="18"
              height="18"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="m21 15-5-5L5 21"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="text-sm text-ink-muted">No photos yet</p>
          <p className="text-xs text-ink-muted/70 mt-1">
            Property images will appear here
          </p>
        </div>
      </div>
    );
  }

  const current = images[currentIndex];
  const hasMultiple = images.length > 1;

  function goNext() {
    setCurrentIndex((i) => (i + 1) % images.length);
  }

  function goPrev() {
    setCurrentIndex((i) => (i - 1 + images.length) % images.length);
  }

  return (
    <div className={`relative overflow-hidden rounded-[var(--radius-card)] bg-muted group ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={current.url}
        alt={current.caption ?? "Property photo"}
        className="w-full h-full object-cover"
      />

      {/* Navigation arrows */}
      {hasMultiple && (
        <>
          <button
            type="button"
            onClick={goPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60"
            aria-label="Previous image"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M10 4L6 8l4 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={goNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60"
            aria-label="Next image"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M6 4l4 4-4 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </>
      )}

      {/* Dot indicators */}
      {hasMultiple && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setCurrentIndex(i)}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === currentIndex ? "bg-white" : "bg-white/50"
              }`}
              aria-label={`Go to image ${i + 1}`}
            />
          ))}
        </div>
      )}

      {/* Image counter */}
      {hasMultiple && (
        <span className="absolute top-3 right-3 rounded-full bg-black/40 px-2.5 py-0.5 text-xs font-medium text-white">
          {currentIndex + 1} / {images.length}
        </span>
      )}
    </div>
  );
}
