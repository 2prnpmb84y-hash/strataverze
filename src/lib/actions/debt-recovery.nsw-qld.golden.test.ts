/**
 * NSW and Queensland debt recovery actions, golden (debt recovery step order
 * fix, before VIC, ACT and WA stage 2, PR 9, 29 Oct 2026). Recorded on
 * origin/main (1345040) in a temporary worktree, before the server checked
 * the order of the recovery steps and the legal referral. What
 * initiateDebtRecoveryAction, completeDebtRecoveryStepAction,
 * updateDebtRecoveryCaseAction and closeDebtRecoveryCaseAction return, write
 * and log for an NSW and a Queensland building must stay exactly the same.
 * Never regenerate these snapshots to make a change pass: a difference is a
 * change to NSW or Queensland debt recovery.
 *
 * Each entry is the action's return and, in order, every write it made: the
 * arguments to createDebtRecoveryCase, createDebtRecoveryStep,
 * updateDebtRecoveryCase, updateDebtRecoveryStep, logDebtRecoveryActivity and
 * captureUsageFee, and the paths revalidated (an initiate entry also holds
 * the lot's payment plans afterwards, for the plan the action links). Which
 * connection ran a write (db.orm or a transaction's) is not recorded, only the
 * write. Timestamps are masked, and ids the in-memory database gives are
 * numbered in the order they appear in the entry. The date is fixed at
 * 2 Nov 2026.
 *
 * The entries named "deliberate:" record what the actions did on this base
 * for a step completed out of order, a step completed on a closed case and a
 * legal referral status set before the legal referral step was complete. They
 * are the entries the step order fix is meant to change.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  log: [] as unknown[],
  featuresOff: false,
}));

/** A recorded value: a plain copy, without the database handle a write was given. */
const isOrm = (a: unknown) => !!a && typeof a === "object" && "public" in (a as object);
const recorded = (args: unknown[]) => JSON.parse(JSON.stringify(args.filter((a) => !isOrm(a)), (_k, v) => (v instanceof FormData ? Object.fromEntries(v) : v)));

vi.mock("@prisma/orm-postgres/orm-client", async () => (await import("@/test/fake-orm")).fakeOrmClient);
vi.mock("@/prisma/db", async () => ({ db: (await import("@/test/fake-orm")).sharedFake.db }));
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => state.log.push({ revalidatePath: p }) }));
vi.mock("@/lib/auth/require-membership", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/require-membership")>()),
  requireSchemeMembership: vi.fn(async () => ({ profile: { id: "adviser" }, membership: { role: "ADVISER" }, roles: ["ADVISER"] })),
}));
vi.mock("@/lib/billing/capture", () => ({
  captureUsageFee: vi.fn(async (...a: unknown[]) => {
    state.log.push({ captureUsageFee: recorded(a) });
  }),
}));
vi.mock("@/lib/queries/debt-recovery", async (orig) => {
  const real = await orig<typeof import("@/lib/queries/debt-recovery")>();
  const wrap = <K extends keyof typeof real>(name: K) =>
    (async (...a: unknown[]) => {
      state.log.push({ [name]: recorded(a) });
      return (real[name] as (...x: unknown[]) => unknown)(...a);
    }) as unknown as (typeof real)[K];
  return {
    ...real,
    createDebtRecoveryCase: wrap("createDebtRecoveryCase"),
    createDebtRecoveryStep: wrap("createDebtRecoveryStep"),
    updateDebtRecoveryCase: wrap("updateDebtRecoveryCase"),
    updateDebtRecoveryStep: wrap("updateDebtRecoveryStep"),
    logDebtRecoveryActivity: wrap("logDebtRecoveryActivity"),
    createDebtRecoveryDocument: wrap("createDebtRecoveryDocument"),
  };
});
// FEATURES off: the NSW pack with the recovery steps switched off.
vi.mock("@/lib/jurisdiction/scheme-rules", async (orig) => {
  const real = await orig<typeof import("@/lib/jurisdiction/scheme-rules")>();
  return {
    ...real,
    rulesForScheme: async (...a: Parameters<typeof real.rulesForScheme>) => {
      const r = await real.rulesForScheme(...a);
      return state.featuresOff ? { ...r, rules: { ...r.rules, FEATURES: { ...r.rules.FEATURES, debtRecoverySteps: false } } } : r;
    },
  };
});

const { sharedFake } = await import("@/test/fake-orm");
const actions = await import("./debt-recovery");
const { RULE_PACKS } = await import("@/config/statutory");

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-02T01:00:00.000Z"));
});
afterAll(() => {
  vi.useRealTimers();
});

const SCHEME = "scheme-1";
type State = "NSW" | "QLD";
const packSteps = (s: State) => {
  const steps = RULE_PACKS[s].rules.DEBT_RECOVERY_STEPS;
  if (!steps) throw new Error(`The ${s} pack has no recovery steps`);
  return steps;
};

/** Mask timestamps and number the in-memory database's ids in order of appearance. */
function normalise(value: unknown): unknown {
  const ids = new Map<string, string>();
  return JSON.parse(JSON.stringify(value), (_k, v) => {
    if (typeof v !== "string") return v;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) return "<timestamp>";
    return v.replace(/fake-([A-Za-z]+)-\d+/g, (m, model: string) => {
      if (!ids.has(m)) ids.set(m, `<${model} ${[...ids.keys()].filter((k) => k.startsWith(`fake-${model}-`)).length + 1}>`);
      return ids.get(m)!;
    });
  });
}

const overdueNotices = [
  { id: "notice-1", schemeId: SCHEME, lotId: "lot-1", status: "OVERDUE", dueDate: "2026-07-01", balanceOutstanding: "1200.00", interestCharged: "35.50" },
  { id: "notice-2", schemeId: SCHEME, lotId: "lot-1", status: "OVERDUE", dueDate: "2026-10-01", balanceOutstanding: "800.25", interestCharged: null },
];

/**
 * Seed a building in `st` with lot 1 and its owner. With `completedBefore`,
 * a case on lot 1 whose steps (the pack's, in order) before that order are
 * complete and whose current step is that step.
 */
function seed(
  st: string,
  opts: {
    notices?: boolean;
    plan?: boolean;
    completedBefore?: number;
    currentStep?: string;
    caseStatus?: string;
    completed?: (order: number) => boolean;
  } = {},
) {
  const steps = st === "NSW" || st === "QLD" ? packSteps(st) : [];
  const caseSteps =
    opts.completedBefore === undefined
      ? []
      : steps.map(({ status: _ruleStatus, ...s }) => {
          const done = opts.completed ? opts.completed(s.stepOrder) : s.stepOrder < opts.completedBefore!;
          return {
            ...s,
            id: `step-${String(s.stepOrder).padStart(2, "0")}`,
            caseId: "case-1",
            status: done ? "COMPLETED" : "PENDING",
            completedAt: done ? "2026-10-20T00:00:00.000Z" : null,
            completedBy: done ? "adviser" : null,
          };
        });
  const current = opts.currentStep ?? steps.find((s) => s.stepOrder === opts.completedBefore)?.stepType ?? "LEDGER_VERIFICATION";
  sharedFake.reset({
    Scheme: [{ id: SCHEME, state: st, timeZone: st === "QLD" ? "Australia/Brisbane" : "Australia/Sydney" }],
    Lot: [{ id: "lot-1", schemeId: SCHEME, lotNumber: "1" }],
    SchemeMembership: [
      { id: "m-owner", schemeId: SCHEME, lotId: "lot-1", profileId: "debtor", role: "OWNER", isActive: true, endDate: null },
      { id: "m-adviser", schemeId: SCHEME, lotId: null, profileId: "adviser", role: "ADVISER", isActive: true, endDate: null },
    ],
    LevyNotice: opts.notices === false ? [] : overdueNotices.map((n) => ({ ...n })),
    PaymentPlan: opts.plan ? [{ id: "plan-1", schemeId: SCHEME, lotId: "lot-1", status: "ACTIVE", caseId: null }] : [],
    DebtRecoveryCase:
      opts.completedBefore === undefined
        ? []
        : [
            {
              id: "case-1",
              schemeId: SCHEME,
              lotId: "lot-1",
              ownerId: "debtor",
              caseNumber: "DR-2026-0001",
              status: opts.caseStatus ?? "OPEN",
              currentStep: current,
              rulePack: `AU-${st} test`,
            },
          ],
    DebtRecoveryStep: caseSteps,
    DebtRecoveryActivity: [],
  });
  state.log = [];
  state.featuresOff = false;
}

/** The form the case screen sends to complete a step. */
function stepForm(stepType: string, noticeType: string | null | undefined, feeCents: number | null) {
  const f = new FormData();
  f.set("outcome", `${stepType} done`);
  f.set("evidenceNotes", `Evidence for ${stepType}`);
  f.set("noticeMethod", noticeType ? "REGISTERED_POST" : "");
  f.set("stepType", stepType);
  if (feeCents != null) f.set("feeConfirmedCents", String(feeCents));
  return f;
}

async function entry(run: () => Promise<unknown>) {
  const result = await run();
  return normalise({ result, writes: state.log });
}

/** An initiate entry also holds the lot's payment plans after the action (a plan being followed is linked to the new case). */
async function initiateEntry() {
  const result = await actions.initiateDebtRecoveryAction(SCHEME, "lot-1", "debtor", "ADVISER");
  const paymentPlans = sharedFake.table("PaymentPlan").map((p) => ({ id: p.id, caseId: p.caseId, status: p.status }));
  return normalise({ result, writes: state.log, paymentPlans });
}

const complete = (stepId: string, form: FormData) => () => actions.completeDebtRecoveryStepAction(stepId, "case-1", SCHEME, form);
const update = (fields: Record<string, string>) => () => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return actions.updateDebtRecoveryCaseAction("case-1", SCHEME, f);
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("initiateDebtRecoveryAction", () => {
  it("NSW, no payment plan", async () => {
    seed("NSW");
    expect(await initiateEntry()).toMatchSnapshot();
  });

  it("NSW, an active payment plan (linked, case starts in PAYMENT_PLAN)", async () => {
    seed("NSW", { plan: true });
    expect(await initiateEntry()).toMatchSnapshot();
  });

  it("QLD, an active payment plan (not linked)", async () => {
    seed("QLD", { plan: true });
    expect(await initiateEntry()).toMatchSnapshot();
  });

  it("NSW, no overdue notices", async () => {
    seed("NSW", { notices: false });
    expect(await initiateEntry()).toMatchSnapshot();
  });

  it("QLD, no overdue notices", async () => {
    seed("QLD", { notices: false });
    expect(await initiateEntry()).toMatchSnapshot();
  });

  it("unsupported state (VIC)", async () => {
    seed("VIC");
    expect(await initiateEntry()).toMatchSnapshot();
  });

  it("FEATURES off (debtRecoverySteps false)", async () => {
    seed("NSW");
    state.featuresOff = true;
    expect(await initiateEntry()).toMatchSnapshot();
  });
});

const FEE_CENTS: Record<string, number> = { REMINDER_NOTICE: 550, FINAL_NOTICE: 1100, LEGAL_REFERRAL: 2200 };

for (const st of ["NSW", "QLD"] as const) {
  describe(`completeDebtRecoveryStepAction, ${st}, every step in order`, () => {
    for (const step of packSteps(st)) {
      const n = String(step.stepOrder).padStart(2, "0");
      it(`${st} in order ${n} ${step.stepType}`, async () => {
        seed(st, { completedBefore: step.stepOrder });
        const form = stepForm(step.stepType, step.noticeType, FEE_CENTS[step.stepType] ?? null);
        expect(await entry(complete(`step-${n}`, form))).toMatchSnapshot();
      });
    }
  });
}

describe("completeDebtRecoveryStepAction, refusals and plans", () => {
  it("NSW pause refusal: FINAL_NOTICE is current and a payment plan is being followed", async () => {
    seed("NSW", { completedBefore: 4, plan: true });
    expect(await entry(complete("step-04", stepForm("FINAL_NOTICE", "FINAL_DEMAND", 1100)))).toMatchSnapshot();
  });

  it("QLD: a payment plan does not pause FINAL_NOTICE (no payment plan workflow)", async () => {
    seed("QLD", { completedBefore: 4, plan: true });
    expect(await entry(complete("step-04", stepForm("FINAL_NOTICE", "FINAL_DEMAND", 1100)))).toMatchSnapshot();
  });

  it("NSW: a step already complete", async () => {
    seed("NSW", { completedBefore: 4 });
    expect(await entry(complete("step-02", stepForm("INITIAL_CONTACT", "REMINDER", null)))).toMatchSnapshot();
  });

  it("deliberate: NSW out of order, FINAL_NOTICE while LEDGER_VERIFICATION is current", async () => {
    seed("NSW", { completedBefore: 1 });
    expect(await entry(complete("step-04", stepForm("FINAL_NOTICE", "FINAL_DEMAND", 1100)))).toMatchSnapshot();
  });

  it("deliberate: QLD out of order, LEGAL_REFERRAL while REMINDER_NOTICE is current", async () => {
    seed("QLD", { completedBefore: 3 });
    expect(await entry(complete("step-07", stepForm("LEGAL_REFERRAL", null, 2200)))).toMatchSnapshot();
  });

  it("deliberate: NSW out of order, HARDSHIP_REVIEW passed over (COMMITTEE_REVIEW while HARDSHIP_REVIEW is current)", async () => {
    seed("NSW", { completedBefore: 5 });
    expect(await entry(complete("step-06", stepForm("COMMITTEE_REVIEW", null, null)))).toMatchSnapshot();
  });

  it("deliberate: NSW closed case, its CLOSED step completed after the case was closed", async () => {
    seed("NSW", { completedBefore: 10, caseStatus: "CLOSED_PAID", currentStep: "CLOSED" });
    expect(await entry(complete("step-10", stepForm("CLOSED", null, null)))).toMatchSnapshot();
  });
});

describe("updateDebtRecoveryCaseAction", () => {
  const referral = { status: "REFERRED_LEGAL", solicitorName: "Smith Lawyers", solicitorRef: "SL-77", notes: "Referred" };
  for (const st of ["NSW", "QLD"] as const) {
    it(`${st} REFERRED_LEGAL after the referral step, no plan`, async () => {
      seed(st, { completedBefore: 8 });
      expect(await entry(update(referral))).toMatchSnapshot();
    });

    it(`${st} REFERRED_LEGAL after the referral step, a payment plan being followed`, async () => {
      seed(st, { completedBefore: 8, plan: true });
      expect(await entry(update(referral))).toMatchSnapshot();
    });

    it(`deliberate: ${st} REFERRED_LEGAL before the referral step, no plan`, async () => {
      seed(st, { completedBefore: 4 });
      expect(await entry(update(referral))).toMatchSnapshot();
    });
  }

  it("NSW REFERRED_LEGAL before the referral step, a payment plan being followed (the plan refusal)", async () => {
    seed("NSW", { completedBefore: 4, plan: true });
    expect(await entry(update(referral))).toMatchSnapshot();
  });

  it("NSW ON_HOLD with notes, before the referral step", async () => {
    seed("NSW", { completedBefore: 4 });
    expect(await entry(update({ status: "ON_HOLD", priority: "HIGH", notes: "Owner overseas" }))).toMatchSnapshot();
  });

  it("QLD a case already REFERRED_LEGAL saved again with a court file number", async () => {
    seed("QLD", { completedBefore: 4, caseStatus: "REFERRED_LEGAL" });
    expect(await entry(update({ status: "REFERRED_LEGAL", courtFileNumber: "2026/0042" }))).toMatchSnapshot();
  });
});

describe("closeDebtRecoveryCaseAction", () => {
  for (const st of ["NSW", "QLD"] as const) {
    for (const status of ["CLOSED_PAID", "CLOSED_WRITTEN_OFF", "CLOSED_SETTLED"] as const) {
      it(`${st} ${status}`, async () => {
        seed(st, { completedBefore: 4 });
        expect(await entry(() => actions.closeDebtRecoveryCaseAction("case-1", SCHEME, `Closed as ${status}`, status))).toMatchSnapshot();
      });
    }
  }
});
