import { notFound } from "next/navigation";
import { rulesForScheme } from "@/lib/jurisdiction/scheme-rules";
import { connection } from "next/server";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemeById } from "@/lib/queries/schemes";
import {
  getDebtRecoveryCaseWithDetails,
  getInstalmentsForPlan,
} from "@/lib/queries/debt-recovery";
import { CaseDetailClient } from "./case-detail-client";
import { previewRecoveryFees } from "@/lib/billing/capture";
import { needRule } from "@/config/statutory";

export default async function DebtRecoveryCaseDetailPage({
  params,
}: {
  params: Promise<{ id: string; caseId: string }>;
}) {
  await connection();
  const { id, caseId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();
  const { rules } = await rulesForScheme(id);
  if (!rules.FEATURES.debtRecoverySteps) notFound();

  const debtCase = await getDebtRecoveryCaseWithDetails(caseId);
  if (!debtCase || debtCase.schemeId !== id) notFound();

  // Get the lot and owner info from scheme memberships
  const lot = scheme.lots?.find((l) => l.id === debtCase.lotId);
  const ownerMembership = scheme.memberships.find(
    (m) => m.profileId === debtCase.ownerId && m.role === "OWNER",
  );
  const ownerName = ownerMembership?.profile
    ? `${ownerMembership.profile.firstName ?? ""} ${ownerMembership.profile.lastName ?? ""}`.trim()
    : "Unknown";

  // Load instalments if there's a payment plan
  let instalments: Array<{
    id: string;
    instalmentNumber: number;
    dueDate: string;
    amount: number;
    status: string;
    amountPaid: number | null;
    paidAt: string | null;
  }> = [];

  if (debtCase.paymentPlan) {
    const rawInstalments = await getInstalmentsForPlan(debtCase.paymentPlan.id);
    instalments = rawInstalments.map((inst) => ({
      id: inst.id,
      instalmentNumber: inst.instalmentNumber,
      dueDate: String(inst.dueDate),
      amount: Number(inst.amount),
      status: inst.status,
      amountPaid: inst.amountPaid ? Number(inst.amountPaid) : null,
      paidAt: inst.paidAt ? String(inst.paidAt) : null,
    }));
  }

  return (
    <CaseDetailClient
      recoveryFees={await previewRecoveryFees()}
      stepGuidance={needRule(rules, "DEBT_RECOVERY_GUIDANCE")}
      schemeId={id}
      lotNumber={lot ? String(lot.lotNumber) : "—"}
      unitNumber={lot?.unitNumber ?? null}
      ownerName={ownerName}
      debtCase={{
        id: debtCase.id,
        caseNumber: debtCase.caseNumber,
        lotId: debtCase.lotId,
        ownerId: debtCase.ownerId,
        status: debtCase.status,
        priority: debtCase.priority,
        principalOwed: Number(debtCase.principalOwed),
        interestOwed: Number(debtCase.interestOwed),
        costsOwed: Number(debtCase.costsOwed ?? 0),
        totalOwed: Number(debtCase.totalOwed),
        currentStep: debtCase.currentStep,
        notes: debtCase.notes,
        solicitorRef: debtCase.solicitorRef,
        solicitorName: debtCase.solicitorName,
        courtFileNumber: debtCase.courtFileNumber,
        excludeFromRecovery: debtCase.excludeFromRecovery,
        exclusionReason: debtCase.exclusionReason,
        createdAt: String(debtCase.createdAt),
        closedAt: debtCase.closedAt ? String(debtCase.closedAt) : null,
        closedReason: debtCase.closedReason,
      }}
      steps={debtCase.steps.map((s) => ({
        id: s.id,
        stepType: s.stepType,
        stepOrder: s.stepOrder,
        actionRequired: s.actionRequired,
        legalBasis: s.legalBasis,
        responsibleParty: s.responsibleParty,
        approvalRequired: s.approvalRequired,
        status: s.status,
        completedAt: s.completedAt ? String(s.completedAt) : null,
        outcome: s.outcome,
        evidenceNotes: s.evidenceNotes,
        noticeType: s.noticeType,
        noticeMethod: s.noticeMethod,
        noticeSentAt: s.noticeSentAt ? String(s.noticeSentAt) : null,
      }))}
      paymentPlan={
        debtCase.paymentPlan
          ? {
              id: debtCase.paymentPlan.id,
              totalAmount: Number(debtCase.paymentPlan.totalAmount),
              instalmentAmount: Number(debtCase.paymentPlan.instalmentAmount),
              frequency: debtCase.paymentPlan.frequency,
              startDate: String(debtCase.paymentPlan.startDate),
              endDate: String(debtCase.paymentPlan.endDate),
              numberOfInstalments: debtCase.paymentPlan.numberOfInstalments,
              status: debtCase.paymentPlan.status,
              requestId: debtCase.paymentPlan.requestId ?? null,
            }
          : null
      }
      instalments={instalments}
      documents={debtCase.documents.map((d) => ({
        id: d.id,
        documentType: d.documentType,
        title: d.title,
        isDraft: d.isDraft,
        createdAt: String(d.createdAt),
        issuedAt: d.issuedAt ? String(d.issuedAt) : null,
      }))}
      activities={debtCase.activities.map((a) => ({
        id: a.id,
        activityType: a.activityType,
        description: a.description,
        createdAt: String(a.createdAt),
      }))}
    />
  );
}
