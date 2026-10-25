import type { LabelTone } from "@/lib/vault/labels";

const toneStyles: Record<LabelTone, string> = {
  good: "bg-[#E6F7F3] text-[#1A7A63]",
  neutral: "bg-[#F1F5F9] text-ink-muted",
  warning: "bg-[#FFF3E0] text-[#A16207]",
  bad: "bg-[#FDECEC] text-[#B33A3A]",
};

/** A plain-language vault label. The detail says exactly what was checked. */
export function VaultLabelChip({ tone, text, detail }: { tone: LabelTone; text: string; detail?: string }) {
  return (
    <span title={detail} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${toneStyles[tone]}`}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" className="shrink-0">
        {tone === "good" ? (
          <path d="M2.5 6.2l2.2 2.2 4.8-4.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        ) : tone === "bad" ? (
          <path d="M3.5 3.5l5 5M8.5 3.5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        ) : (
          <circle cx="6" cy="6" r="2" fill="currentColor" />
        )}
      </svg>
      {text}
    </span>
  );
}
