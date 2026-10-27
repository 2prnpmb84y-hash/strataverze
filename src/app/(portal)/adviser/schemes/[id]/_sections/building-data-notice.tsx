/**
 * What a building is missing that its rule pack asks it to hold (QLD stage 2,
 * step 10): the regulation module, or a lot's second entitlement. Shown to
 * the adviser only, and only when something is missing (never for NSW).
 */
export function BuildingDataNotice({ problems }: { problems: readonly string[] }) {
  if (!problems.length) return null;
  return (
    <div role="status" className="mb-6 rounded-[var(--radius-card)] border border-[#F5C98A] bg-[#FFF3E0] px-4 py-3 text-sm text-ink">
      <p className="font-medium">Building data missing</p>
      <ul className="mt-1 list-disc pl-5 space-y-0.5">
        {problems.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  );
}
