import { notFound } from "next/navigation";
import { rulesForScheme } from "@/lib/jurisdiction/scheme-rules";
import { getCurrentProfile } from "@/lib/queries/profiles";
import {
  getDebtRecoveryCaseWithDetails,
  getInstalmentsForPlan,
} from "@/lib/queries/debt-recovery";
import { caseViewerFor, debtorCaseView } from "@/lib/owner/debt-case-view";
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import { PageHeader } from "@/components/ui/page-header";
import { connection } from "next/server";
import { CaseDetailOwnerClient } from "./case-detail-owner-client";
import { previewRecoveryFees } from "@/lib/billing/capture";

export default async function OwnerCaseDetailPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  await connection();
  const { caseId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const debtCase = await getDebtRecoveryCaseWithDetails(caseId);
  if (!debtCase) notFound();

  // Committee of THIS case's scheme sees the full case; the debtor, while
  // (or within 30 days of being) an owner of the lot, sees a limited view.
  // Everyone else gets a 404. Inactive memberships are loaded on purpose,
  // for the former-owner grace period.
  const memberships = await db.orm.public.SchemeMembership
    .where((m) => and(m.schemeId.eq(debtCase.schemeId), m.profileId.eq(profile.id)))
    .limit(20)
    .all();
  const viewer = caseViewerFor(debtCase, profile.id, memberships);
  if (!viewer) notFound();
  const isCommittee = viewer === "committee";

  // Fetch instalments if there is a payment plan
  let instalments: Array<{
    id: string;
    instalmentNumber: number;
    dueDate: string;
    amount: number;
    amountPaid: number;
    status: string;
    paidAt: string | null;
  }> = [];

  if (debtCase.paymentPlan) {
    const raw = await getInstalmentsForPlan(debtCase.paymentPlan.id);
    instalments = raw.map((i) => ({
      id: i.id,
      instalmentNumber: i.instalmentNumber,
      dueDate: String(i.dueDate),
      amount: Number(i.amount),
      amountPaid: Number(i.amountPaid ?? 0),
      status: i.status,
      paidAt: i.paidAt ? String(i.paidAt) : null,
    }));
  }

  // Serialise for client
  const full = {
    id: debtCase.id,
    caseNumber: debtCase.caseNumber,
    schemeId: debtCase.schemeId,
    lotId: debtCase.lotId,
    ownerId: debtCase.ownerId,
    status: debtCase.status,
    currentStep: debtCase.currentStep ?? "",
    priority: debtCase.priority ?? "NORMAL",
    principalOwed: Number(debtCase.principalOwed),
    interestOwed: Number(debtCase.interestOwed ?? 0),
    costsOwed: Number(debtCase.costsOwed ?? 0),
    totalOwed: Number(debtCase.totalOwed),
    solicitorName: debtCase.solicitorName ?? null,
    solicitorRef: debtCase.solicitorRef ?? null,
    courtFileNumber: debtCase.courtFileNumber ?? null,
    hasDispute: !!debtCase.hasDispute,
    disputeDetails: debtCase.disputeDetails ?? null,
    hasHardshipRequest: !!debtCase.hasHardshipRequest,
    hardshipDetails: debtCase.hardshipDetails ?? null,
    notes: debtCase.notes ?? null,
    closedAt: debtCase.closedAt ? String(debtCase.closedAt) : null,
    closedReason: debtCase.closedReason ?? null,
    createdAt: String(debtCase.createdAt),
    steps: debtCase.steps.map((s) => ({
      id: s.id,
      stepType: s.stepType,
      stepOrder: s.stepOrder,
      actionRequired: s.actionRequired,
      legalBasis: s.legalBasis ?? null,
      responsibleParty: s.responsibleParty,
      status: s.status,
      completedAt: s.completedAt ? String(s.completedAt) : null,
      outcome: s.outcome ?? null,
      evidenceNotes: s.evidenceNotes ?? null,
    })),
    paymentPlan: debtCase.paymentPlan
      ? {
          id: debtCase.paymentPlan.id,
          totalAmount: Number(debtCase.paymentPlan.totalAmount),
          instalmentAmount: Number(debtCase.paymentPlan.instalmentAmount),
          frequency: debtCase.paymentPlan.frequency,
          startDate: String(debtCase.paymentPlan.startDate),
          endDate: String(debtCase.paymentPlan.endDate),
          numberOfInstalments: debtCase.paymentPlan.numberOfInstalments,
          status: debtCase.paymentPlan.status,
        }
      : null,
    instalments,
    documents: debtCase.documents.map((d) => ({
      id: d.id,
      documentType: d.documentType,
      title: d.title,
      isDraft: !!d.isDraft,
      createdAt: String(d.createdAt),
    })),
    activities: debtCase.activities.map((a) => ({
      id: a.id,
      activityType: a.activityType,
      description: a.description,
      createdAt: String(a.createdAt),
    })),
  };
  const serialised = isCommittee ? full : debtorCaseView(full);

  const terms = (await rulesForScheme(debtCase.schemeId)).rules.TERMINOLOGY;
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Case ${debtCase.caseNumber}`}
        description={
          isCommittee
            ? "Manage this debt recovery case."
            : "View your debt recovery case details."
        }
        backHref="/owner/levies/debt-recovery"
        backLabel="Back to Cases"
      />

      <CaseDetailOwnerClient
        debtCase={serialised}
        isCommittee={isCommittee}
        recoveryFees={isCommittee ? await previewRecoveryFees() : {}}
        recoveryLaw={`${terms.jurisdictionShort} ${terms.act}`}
      />
    </div>
  );
}
