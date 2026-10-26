import { rulesForScheme } from "@/lib/jurisdiction/scheme-rules";
import { connection } from "next/server";
import { getDocumentsForScheme } from "@/lib/queries/documents";
import { DocumentsTabContent } from "@/components/documents/documents-tab-content";
import { requireAdviserScheme } from "../_sections/require-adviser-scheme";
import { isVaultTrialBuilding } from "@/config/vault";
import { vaultLibraryView } from "@/lib/vault/queries";
import { VaultBanner, type VaultBannerData } from "@/components/vault/vault-banner";
import { IssuedByStrataVerze } from "@/components/vault/issued-by-strataverze";
import type { LabelTone } from "@/lib/vault/labels";

/** Documents section (moved from the former Documents tab). */
export default async function DocumentsSectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const scheme = await requireAdviserScheme(id);
  if (!scheme) return null;

  const documents = await getDocumentsForScheme(id);

  // The building vault trial: the library is also the vault's front door.
  const trial = isVaultTrialBuilding(scheme.planNumber);
  // A vault problem must not take the library down with it.
  const vault = trial
    ? await vaultLibraryView(id).catch((err) => {
        console.error("[vault] library view failed:", err instanceof Error ? err.message : "error");
        return null;
      })
    : null;
  const banner: VaultBannerData | null = !vault
    ? null
    : vault.vault
      ? { opened: true, openedAt: vault.vault.openedAt, recordCount: vault.recordCount, lastCheck: vault.lastCheck, pendingCount: vault.pending.length }
      : { opened: false };
  const vaultLabels: Record<string, { tone: LabelTone; text: string; detail: string }> | undefined =
    vault?.vault
      ? Object.fromEntries(
          documents.map((d) => {
            const label = vault.byDocumentId[d.id]?.latest?.labels[0];
            if (label) return [d.id, label];
            const copy = vault.copyOf[d.id];
            if (copy) return [d.id, { tone: "neutral" as const, text: "Same file as another document", detail: `The vault keeps this file once, under \u201c${copy}\u201d, and records this copy as received again.` }];
            return [d.id, { tone: "warning" as const, text: "Not yet in the vault", detail: "Use \u201cBring them in\u201d above to capture it." }];
          }),
        )
      : undefined;

  return (
    <>
    {banner && <VaultBanner schemeId={id} data={banner} />}
    <DocumentsTabContent
      vaultLabels={vaultLabels}
      retention={(await rulesForScheme(id)).rules.RECORD_RETENTION}
      schemeId={id}
      schemePlanNumber={scheme.planNumber}
      documents={documents.map((d) => ({
        id: d.id,
        title: d.title,
        fileName: d.fileName,
        fileUrl: d.fileUrl,
        fileSize: d.fileSize,
        mimeType: d.mimeType,
        category: d.category,
        documentType: d.documentType ?? null,
        documentDate: d.documentDate ? String(d.documentDate) : null,
        strataPlan: d.strataPlan ?? null,
        schedule: d.schedule ?? null,
        lotNumber: d.lotNumber ?? null,
        visibility: String(d.visibility ?? "ALL_MEMBERS"),
        supplier: d.supplier ?? null,
        comments: d.comments ?? null,
        description: d.description ?? null,
        createdAt: String(d.createdAt),
      }))}
    />
    {vault?.vault && (
      <IssuedByStrataVerze
        schemeId={id}
        records={vault.issuedByStrataVerze.map((r) => ({ id: r.id, title: r.title, recordType: r.recordType, createdAt: r.createdAt, label: r.latest?.labels[0] ?? null }))}
      />
    )}
    </>
  );
}
