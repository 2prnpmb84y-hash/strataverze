import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/prisma/db";
import { requireSchemeMembership } from "@/lib/auth/require-membership";
import { getSchemeById } from "@/lib/queries/schemes";
import { ONBOARDING_SOURCE, getCutoverView, listCutovers, SOURCE_SYSTEMS, sourceSystemLabel } from "@/lib/finance/migration-batches";
import { CUTOVER_DATA_TYPES, CUTOVER_LABELS } from "@/lib/finance/migration-cutover";
import { FIELDS } from "@/lib/finance/migration-templates";
import { PageHeader } from "@/components/ui/page-header";
import { CutoverClient, type CutoverClientView } from "./cutover-client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Stage 7: the financial cutover from another system. */
export default async function CutoverPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ batch?: string; onboarding?: string }> }) {
  await connection();
  const { id } = await params;
  const { batch, onboarding } = await searchParams;
  await requireSchemeMembership(id, ["ADVISER"]);
  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const batches = await listCutovers(id);
  // With no cutover chosen, open the one that matters: the executed one, else
  // the draft onboarding prepared (hand-started drafts are easy to open by mistake).
  const defaultBatch = batches.find((b) => b.status === "EXECUTED") ?? batches.find((b) => b.sourceSystem === ONBOARDING_SOURCE.value);
  const selectedId = batch && UUID.test(batch) && batches.some((b) => b.id === batch) ? batch : (defaultBatch?.id ?? null);
  let view: CutoverClientView | null = null;
  if (selectedId) {
    const v = await getCutoverView(id, selectedId);
    const batchRow = batches.find((b) => b.id === selectedId)!;
    const ids = [...new Set([v.signOff?.signedOffBy, batchRow.executedBy].filter((x): x is string => !!x))];
    const profiles = ids.length ? await db.orm.public.Profile.where((p) => p.id.in(ids)).limit(20).all() : [];
    const name = (pid: string | null | undefined) => {
      const p = profiles.find((x) => x.id === pid);
      return p ? `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() || String(p.email ?? "") : null;
    };
    view = {
      id: v.id,
      sourceLabel: v.sourceLabel,
      template: v.template,
      cutoverDate: v.cutoverDate,
      status: v.status,
      staged: v.staged,
      files: v.evaluation.files,
      rowProblems: CUTOVER_DATA_TYPES.map((t) => ({
        dataType: t,
        rows: ((v.evaluation.rows[t] ?? []) as Array<{ rowNumber: number; errors: string[]; warnings: string[] }>)
          .filter((r) => r.errors.length || r.warnings.length)
          .slice(0, 100)
          .map((r) => ({ rowNumber: r.rowNumber, errors: r.errors, warnings: r.warnings })),
      })),
      readiness: v.evaluation.readiness,
      signOff: v.signOff ? { ...v.signOff, signedOffByName: name(v.signOff.signedOffBy) } : null,
      results: v.results,
      executedAt: v.executedAt,
      executedByName: name(batchRow.executedBy),
    };
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cutover"
        description="Bring the scheme's finances across at one date: the opening trial balance and the detail behind it. Nothing is posted until the trial balance nets to zero and the cutover is signed off."
        backHref={`/adviser/schemes/${id}/finance/migration`}
        backLabel="Data Migration"
      />
      {onboarding === "not-staged" && (
        <div role="alert" className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          The building and its lots were created, but its opening balances could not be prepared as a cutover. Start a cutover below and load the
          opening trial balance, or ask StrataVerze support to look into it.
        </div>
      )}
      {selectedId && batches.find((b) => b.id === selectedId)?.sourceSystem === ONBOARDING_SOURCE.value && view?.status !== "EXECUTED" && (
        <div className="rounded-[var(--radius-card)] border border-line bg-mint-soft/40 px-4 py-3 text-sm text-ink">
          These opening balances were entered when the building was onboarded. Check them against the previous manager&apos;s handover, then sign off
          and post. The lot arrears carry the takeover date as their due date; to keep each levy&apos;s original due date (for ageing and interest),
          replace the outstanding levy notices file with the notices from the previous system before signing off. If the balance sheet had
          creditors, sign-off asks you to acknowledge the accounts payable difference until the unpaid supplier invoices are loaded.
        </div>
      )}
      {selectedId && (
        <div className="rounded-[var(--radius-card)] border border-line bg-white px-4 py-3 text-sm text-ink">
          Onboarding also needs last year&apos;s income and expenditure, this year&apos;s budget and the levies.{" "}
          <Link href={`/adviser/schemes/${id}/finance/migration/income-budget`} className="font-medium text-turquoise underline">
            Enter income, expenditure and budget
          </Link>
          .
        </div>
      )}
      <CutoverClient
        schemeId={id}
        sources={SOURCE_SYSTEMS}
        batches={batches.map((b) => ({
          id: b.id,
          sourceLabel: sourceSystemLabel(b.sourceSystem),
          cutoverDate: b.cutoverDate ? String(b.cutoverDate).slice(0, 10) : null,
          status: b.status,
          createdAt: String(b.createdAt),
        }))}
        view={view}
        labels={CUTOVER_LABELS}
        fields={Object.fromEntries(CUTOVER_DATA_TYPES.map((t) => [t, FIELDS[t]]))}
        funds={Object.fromEntries((await db.orm.public.Fund.where((f) => f.schemeId.eq(id)).limit(50).all()).map((f) => [f.id, String(f.name)]))}
      />
    </div>
  );
}
