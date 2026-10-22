import { db } from "@/prisma/db";
import type { Numeric, Varchar } from "@prisma/orm-postgres/target/codec-types";

function toNumeric(value: number | string): Numeric<12, 2> {
  return String(value) as unknown as Numeric<12, 2>;
}

function toVarchar<N extends number>(value: string): Varchar<N> {
  return value as unknown as Varchar<N>;
}

// ─── Case Queries ───────────────────────────────────────────────

export async function getDebtRecoveryCasesForScheme(
  schemeId: string,
  filters?: { status?: string; lotId?: string },
) {
  try {
    let query = db.orm.public.DebtRecoveryCase
      .where((c) => c.schemeId.eq(schemeId));

    if (filters?.status) {
      query = query.where((c) => c.status.eq(filters.status!));
    }
    if (filters?.lotId) {
      query = query.where((c) => c.lotId.eq(filters.lotId!));
    }

    return await query
      .orderBy((c) => c.createdAt.desc())
      .all();
  } catch {
    return [];
  }
}

export async function getDebtRecoveryCasesForOwner(ownerId: string) {
  try {
    return await db.orm.public.DebtRecoveryCase
      .where((c) => c.ownerId.eq(ownerId))
      .orderBy((c) => c.createdAt.desc())
      .all();
  } catch {
    return [];
  }
}

export async function getDebtRecoveryCasesForSchemes(schemeIds: string[]) {
  try {
    if (schemeIds.length === 0) return [];
    return await db.orm.public.DebtRecoveryCase
      .where((c) => c.schemeId.in(schemeIds))
      .orderBy((c) => c.createdAt.desc())
      .all();
  } catch {
    return [];
  }
}

export async function getDebtRecoveryCaseById(caseId: string) {
  try {
    return await db.orm.public.DebtRecoveryCase
      .where({ id: caseId })
      .first();
  } catch {
    return null;
  }
}

export async function getDebtRecoveryCaseWithDetails(caseId: string) {
  try {
    const debtCase = await db.orm.public.DebtRecoveryCase
      .where({ id: caseId })
      .first();
    if (!debtCase) return null;

    const [steps, paymentPlan, documents, activities] = await Promise.all([
      getDebtRecoverySteps(caseId),
      getPaymentPlanForCase(caseId),
      getDebtRecoveryDocuments(caseId),
      getDebtRecoveryActivities(caseId, 20),
    ]);

    return { ...debtCase, steps, paymentPlan, documents, activities };
  } catch {
    return null;
  }
}

export async function getDebtRecoveryCaseForLot(lotId: string) {
  try {
    return await db.orm.public.DebtRecoveryCase
      .where((c) => c.lotId.eq(lotId))
      .where((c) => c.status.notIn(["CLOSED_PAID", "CLOSED_WRITTEN_OFF", "CLOSED_SETTLED"]))
      .orderBy((c) => c.createdAt.desc())
      .first();
  } catch {
    return null;
  }
}

export async function createDebtRecoveryCase(data: {
  schemeId: string;
  lotId: string;
  ownerId: string;
  caseNumber: string;
  principalOwed: number;
  interestOwed?: number;
  costsOwed?: number;
  totalOwed: number;
  initiatedBy: string;
  initiatedRole: string;
  notes?: string;
}) {
  return db.orm.public.DebtRecoveryCase.create({
    ...data,
    caseNumber: toVarchar<30>(data.caseNumber),
    principalOwed: toNumeric(data.principalOwed),
    interestOwed: toNumeric(data.interestOwed ?? 0),
    costsOwed: toNumeric(data.costsOwed ?? 0),
    totalOwed: toNumeric(data.totalOwed),
  });
}

export async function updateDebtRecoveryCase(
  caseId: string,
  data: {
    status?: string;
    currentStep?: string;
    priority?: string;
    committeeApproval?: boolean;
    approvalMotionId?: string | null;
    approvalDate?: string | null;
    solicitorRef?: string | null;
    solicitorName?: string | null;
    courtFileNumber?: string | null;
    hasDispute?: boolean;
    disputeDetails?: string | null;
    hasHardshipRequest?: boolean;
    hardshipDetails?: string | null;
    excludeFromRecovery?: boolean;
    exclusionReason?: string | null;
    notes?: string | null;
    closedAt?: string | null;
    closedReason?: string | null;
    principalOwed?: number;
    interestOwed?: number;
    costsOwed?: number;
    totalOwed?: number;
  },
) {
  const mapped: Record<string, unknown> = { ...data };
  if (data.principalOwed !== undefined) mapped.principalOwed = toNumeric(data.principalOwed);
  if (data.interestOwed !== undefined) mapped.interestOwed = toNumeric(data.interestOwed);
  if (data.costsOwed !== undefined) mapped.costsOwed = toNumeric(data.costsOwed);
  if (data.totalOwed !== undefined) mapped.totalOwed = toNumeric(data.totalOwed);
  if (data.solicitorRef !== undefined) mapped.solicitorRef = data.solicitorRef ? toVarchar<100>(data.solicitorRef) : null;
  if (data.solicitorName !== undefined) mapped.solicitorName = data.solicitorName ? toVarchar<200>(data.solicitorName) : null;
  if (data.courtFileNumber !== undefined) mapped.courtFileNumber = data.courtFileNumber ? toVarchar<50>(data.courtFileNumber) : null;

  return db.orm.public.DebtRecoveryCase
    .where({ id: caseId })
    .update(mapped);
}

// ─── Generate Case Number ───────────────────────────────────────

export async function generateCaseNumber(schemeId: string): Promise<string> {
  const year = new Date().getFullYear();
  const existing = await db.orm.public.DebtRecoveryCase
    .where((c) => c.schemeId.eq(schemeId))
    .where((c) => c.caseNumber.like(toVarchar<30>(`DR-${year}-%`)))
    .orderBy((c) => c.caseNumber.desc())
    .all();

  const nextNum = existing.length + 1;
  return `DR-${year}-${String(nextNum).padStart(4, "0")}`;
}

// ─── Step Queries ───────────────────────────────────────────────

export async function getDebtRecoverySteps(caseId: string) {
  try {
    return await db.orm.public.DebtRecoveryStep
      .where((s) => s.caseId.eq(caseId))
      .orderBy((s) => s.stepOrder.asc())
      .all();
  } catch {
    return [];
  }
}

export async function createDebtRecoveryStep(data: {
  caseId: string;
  stepType: string;
  stepOrder: number;
  actionRequired: string;
  legalBasis?: string;
  responsibleParty: string;
  approvalRequired?: boolean;
  triggerCondition?: string;
  dueDate?: string;
  noticeType?: string;
}) {
  return db.orm.public.DebtRecoveryStep.create(data);
}

export async function updateDebtRecoveryStep(
  stepId: string,
  data: {
    status?: string;
    completedAt?: string | null;
    completedBy?: string | null;
    approvedBy?: string | null;
    approvedAt?: string | null;
    noticeSentAt?: string | null;
    noticeMethod?: string | null;
    evidenceNotes?: string | null;
    outcome?: string | null;
    notes?: string | null;
    dueDate?: string | null;
  },
  orm: typeof db.orm = db.orm,
) {
  return orm.public.DebtRecoveryStep
    .where({ id: stepId })
    .update(data);
}

// ─── Payment Plan Queries ───────────────────────────────────────

export async function getPaymentPlanForCase(caseId: string) {
  try {
    return await db.orm.public.PaymentPlan
      .where((p) => p.caseId.eq(caseId))
      .first();
  } catch {
    return null;
  }
}

export async function createPaymentPlan(data: {
  caseId: string;
  schemeId: string;
  lotId: string;
  totalAmount: number;
  instalmentAmount: number;
  frequency: string;
  startDate: string;
  endDate: string;
  numberOfInstalments: number;
  includesInterest?: boolean;
  includesOngoing?: boolean;
  interestWaived?: boolean;
  conditions?: string;
  notes?: string;
}, orm: typeof db.orm = db.orm) {
  return orm.public.PaymentPlan.create({
    ...data,
    totalAmount: toNumeric(data.totalAmount),
    instalmentAmount: toNumeric(data.instalmentAmount),
  });
}

export async function updatePaymentPlan(
  planId: string,
  data: {
    status?: string;
    approvedBy?: string | null;
    approvedAt?: string | null;
    defaultedAt?: string | null;
    defaultReason?: string | null;
    conditions?: string | null;
    notes?: string | null;
  },
) {
  return db.orm.public.PaymentPlan
    .where({ id: planId })
    .update(data);
}

// ─── Instalment Queries ─────────────────────────────────────────

export async function getInstalmentsForPlan(planId: string) {
  try {
    return await db.orm.public.PaymentPlanInstalment
      .where((i) => i.planId.eq(planId))
      .orderBy((i) => i.instalmentNumber.asc())
      .all();
  } catch {
    return [];
  }
}

export async function createInstalment(data: {
  planId: string;
  instalmentNumber: number;
  dueDate: string;
  amount: number;
}) {
  return db.orm.public.PaymentPlanInstalment.create({
    ...data,
    amount: toNumeric(data.amount),
  });
}

export async function updateInstalment(
  instalmentId: string,
  data: {
    status?: string;
    amountPaid?: number;
    paidAt?: string | null;
    notes?: string | null;
  },
) {
  const mapped: Record<string, unknown> = { ...data };
  if (data.amountPaid !== undefined) mapped.amountPaid = toNumeric(data.amountPaid);

  return db.orm.public.PaymentPlanInstalment
    .where({ id: instalmentId })
    .update(mapped);
}

// ─── Document Queries ───────────────────────────────────────────

export async function getDebtRecoveryDocuments(caseId: string) {
  try {
    return await db.orm.public.DebtRecoveryDocument
      .where((d) => d.caseId.eq(caseId))
      .orderBy((d) => d.createdAt.desc())
      .all();
  } catch {
    return [];
  }
}

export async function createDebtRecoveryDocument(data: {
  caseId: string;
  documentType: string;
  title: string;
  description?: string;
  fileUrl?: string;
  generatedContent?: string;
  isDraft?: boolean;
  createdBy: string;
}) {
  return db.orm.public.DebtRecoveryDocument.create({
    ...data,
    title: toVarchar<300>(data.title),
  });
}

export async function updateDebtRecoveryDocument(
  docId: string,
  data: {
    title?: string;
    description?: string | null;
    fileUrl?: string | null;
    generatedContent?: string | null;
    isDraft?: boolean;
    issuedAt?: string | null;
  },
) {
  const mapped: Record<string, unknown> = { ...data };
  if (data.title !== undefined) mapped.title = toVarchar<300>(data.title);

  return db.orm.public.DebtRecoveryDocument
    .where({ id: docId })
    .update(mapped);
}

// ─── Activity Log Queries ───────────────────────────────────────

export async function getDebtRecoveryActivities(
  caseId: string,
  limit = 50,
) {
  try {
    return await db.orm.public.DebtRecoveryActivity
      .where((a) => a.caseId.eq(caseId))
      .orderBy((a) => a.createdAt.desc())
      .limit(limit)
      .all();
  } catch {
    return [];
  }
}

export async function logDebtRecoveryActivity(data: {
  caseId: string;
  activityType: string;
  description: string;
  performedBy: string;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  return db.orm.public.DebtRecoveryActivity.create(data);
}

// ─── Overdue Levy Notices (for initiating recovery) ─────────────

export async function getOverdueLevyNoticesForLot(
  schemeId: string,
  lotId: string,
) {
  try {
    return await db.orm.public.LevyNotice
      .where((n) => n.schemeId.eq(schemeId))
      .where((n) => n.lotId.eq(lotId))
      .where((n) => n.status.eq("OVERDUE"))
      .orderBy((n) => n.dueDate.asc())
      .all();
  } catch {
    return [];
  }
}

// ─── Dashboard Stats ────────────────────────────────────────────

export async function getDebtRecoveryStats(schemeId: string) {
  try {
    const allCases = await db.orm.public.DebtRecoveryCase
      .where((c) => c.schemeId.eq(schemeId))
      .all();

    const activeCases = allCases.filter(
      (c) =>
        !["CLOSED_PAID", "CLOSED_WRITTEN_OFF", "CLOSED_SETTLED"].includes(
          c.status,
        ),
    );

    const totalOwed = activeCases.reduce(
      (sum, c) => sum + Number(c.totalOwed),
      0,
    );
    const withPaymentPlans = activeCases.filter(
      (c) => c.status === "PAYMENT_PLAN",
    ).length;
    const legalReferrals = activeCases.filter(
      (c) => c.status === "REFERRED_LEGAL",
    ).length;

    return {
      totalCases: allCases.length,
      activeCases: activeCases.length,
      totalOwed,
      withPaymentPlans,
      legalReferrals,
    };
  } catch {
    return {
      totalCases: 0,
      activeCases: 0,
      totalOwed: 0,
      withPaymentPlans: 0,
      legalReferrals: 0,
    };
  }
}

// ─── Default Recovery Steps ─────────────────────────────────────

export const DEFAULT_RECOVERY_STEPS = [
  {
    stepType: "LEDGER_VERIFICATION",
    stepOrder: 1,
    actionRequired: "Verify all levy notices, payments, and outstanding balances on the lot ledger",
    legalBasis: "s 83 SSMA 2015",
    responsibleParty: "ADVISER",
    approvalRequired: false,
    triggerCondition: "Case opened",
  },
  {
    stepType: "INITIAL_CONTACT",
    stepOrder: 2,
    actionRequired: "Make initial contact with the lot owner regarding overdue levies",
    responsibleParty: "ADVISER",
    approvalRequired: false,
    triggerCondition: "Ledger verified",
    noticeType: "REMINDER",
  },
  {
    stepType: "REMINDER_NOTICE",
    stepOrder: 3,
    actionRequired: "Issue formal reminder notice with 14-day payment deadline",
    legalBasis: "s 85 SSMA 2015",
    responsibleParty: "ADVISER",
    approvalRequired: false,
    triggerCondition: "14 days after initial contact with no payment",
    noticeType: "DEMAND",
  },
  {
    stepType: "FINAL_NOTICE",
    stepOrder: 4,
    actionRequired: "Issue final demand notice warning of legal action if payment is not received within 21 days",
    legalBasis: "s 85 SSMA 2015",
    responsibleParty: "ADVISER",
    approvalRequired: false,
    triggerCondition: "14 days after reminder notice",
    noticeType: "FINAL_DEMAND",
  },
  {
    stepType: "HARDSHIP_REVIEW",
    stepOrder: 5,
    actionRequired: "Review any hardship application or payment plan request from the owner",
    responsibleParty: "COMMITTEE",
    approvalRequired: true,
    triggerCondition: "Owner submits hardship application or payment plan request",
  },
  {
    stepType: "COMMITTEE_REVIEW",
    stepOrder: 6,
    actionRequired: "Committee review and resolution to approve legal referral (ordinary resolution required)",
    legalBasis: "s 103 SSMA 2015",
    responsibleParty: "COMMITTEE",
    approvalRequired: true,
    triggerCondition: "Final notice period expired with no payment or payment plan",
  },
  {
    stepType: "LEGAL_REFERRAL",
    stepOrder: 7,
    actionRequired: "Refer matter to solicitor for recovery proceedings",
    legalBasis: "s 86 SSMA 2015",
    responsibleParty: "ADVISER",
    approvalRequired: true,
    triggerCondition: "Committee approval granted",
  },
  {
    stepType: "PROCEEDINGS",
    stepOrder: 8,
    actionRequired: "Solicitor files claim in NCAT or Local Court (amounts under $500 to NCAT; over $500 to Local Court)",
    legalBasis: "s 86, s 229 SSMA 2015; Civil & Administrative Tribunal Act 2013",
    responsibleParty: "SOLICITOR",
    approvalRequired: false,
    triggerCondition: "Legal referral accepted",
  },
  {
    stepType: "ENFORCEMENT",
    stepOrder: 9,
    actionRequired: "Enforce judgment via garnishee order, writ of execution, or interest registration on lot",
    legalBasis: "s 86(4) SSMA 2015",
    responsibleParty: "SOLICITOR",
    approvalRequired: false,
    triggerCondition: "Judgment obtained",
  },
  {
    stepType: "CLOSED",
    stepOrder: 10,
    actionRequired: "Close recovery case and update ledger",
    responsibleParty: "ADVISER",
    approvalRequired: false,
    triggerCondition: "Debt fully recovered, written off, or settled",
  },
];
