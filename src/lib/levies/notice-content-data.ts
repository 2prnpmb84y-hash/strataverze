import { ledgerFundDefinition, ledgerFundOf } from "@/lib/jurisdiction/funds";
import type { StatutoryRules } from "@/config/statutory";
import { logError } from "@/lib/log";
/**
 * Gather what each levy notice will state, check it against the content
 * rules, and send the notices (server side).
 */
import { db } from "@/prisma/db";
import { siteUrl } from "@/lib/site-url";
import { and } from "@prisma/orm-postgres/orm-client";
import { sendEmail } from "@/lib/email";
import { levyNoticeEmail } from "@/lib/email-templates/levy-notice";
import { fromCents } from "@/lib/billing/money";
import { validateLevyNoticeContent, type MissingItem } from "@/lib/finance/levy-notice-content";
import { getSchemeInterestSetting } from "@/lib/finance/interest-setting";
import { rulesForState, SchemeNotFoundError } from "@/lib/jurisdiction/scheme-rules";
import { generateLevyNoticePdf } from "@/lib/pdf/generate";
import { lateChargeSentence, noticeLateCharge } from "@/lib/jurisdiction/wording";
import { lateChargeApplies } from "@/lib/finance/statutory-interest";
import { onLotSchedule } from "@/lib/jurisdiction/building-data";
import { toCents, toIsoDay } from "./notice-plan";
import { buildEveryLot, everyLotRequired, everyLotStates, type EveryLotContent } from "./every-lot";

const APP_URL = siteUrl();

export interface PlannedNotice {
  /** Set once the notice exists, so its PDF can be attached to the email. */
  noticeId?: string;
  lotId: string;
  lotNumber: string;
  ownerId: string | null;
  noticeNumber: string;
  dueDate: string;
  amountCents: number;
  /**
   * The first day of the period the notice is for (YYYY-MM-DD), so the
   * notice can state each other unit's contribution for the same period
   * (the ACT, stage 2 PR 6b). Without it, a pack that requires that is refused.
   */
  periodStart?: string;
}

/**
 * What each notice states about the whole building (the ACT, stage 2 PR 6b):
 * each unit's contribution for the notice's schedule and period, the fund
 * and its totals, and the unit's proportion (see ./every-lot.ts). Read from
 * the stored notices of the schedule and period, whose amounts are fixed when
 * they are created; `amountCents` on a notice not stored yet (one being
 * planned) is taken as its amount. Null for a notice whose content cannot be
 * stated: no period, a schedule of another building or fund, or one of the
 * reasons buildEveryLot gives.
 */
export async function loadEveryLot(input: {
  schemeId: string;
  rules: Pick<StatutoryRules, "TERMINOLOGY" | "ENTITLEMENT_SCHEDULES"> & Partial<Pick<StatutoryRules, "CONTRIBUTION_INSURANCE">>;
  fund: { id: string; name: string | null } | null;
  levyScheduleId: string | null | undefined;
  notices: readonly { lotId: string; periodStart?: string | null; amountCents?: number }[];
}): Promise<(EveryLotContent | null)[]> {
  const none = input.notices.map(() => null);
  if (!input.levyScheduleId || !input.fund) return none;
  const scheduleId = input.levyScheduleId;
  const schedule = await db.orm.public.LevySchedule.where((x) => and(x.id.eq(scheduleId), x.schemeId.eq(input.schemeId))).first();
  if (!schedule || schedule.fundId !== input.fund.id) return none;
  const [lots, stored] = await Promise.all([
    db.orm.public.Lot.where((l) => l.schemeId.eq(input.schemeId)).limit(20000).all(),
    db.orm.public.LevyNotice.where((n) => and(n.schemeId.eq(input.schemeId), n.levyScheduleId.eq(scheduleId))).limit(20000).all(),
  ]);
  const t = input.rules.TERMINOLOGY;
  let entitlement: string | null = null;
  try {
    entitlement = onLotSchedule(input.rules).name;
  } catch {
    entitlement = null;
  }
  const words = { lot: t.lot ?? "lot", lots: t.lots ?? "lots", levy: t.levy, entitlement };
  const lotRows = lots.map((l) => ({
    id: l.id,
    lotNumber: String(l.lotNumber),
    entitlement: Number(l.entitlement),
    lotType: l.lotType ?? null,
    deleted: "deletedAt" in l && (l as { deletedAt?: unknown }).deletedAt != null,
  }));
  // Each period's notices: the stored ones, then any being planned for it (not stored yet).
  type PeriodNotice = { lotId: string; cents: number; insuranceSplit: boolean };
  const byPeriod = new Map<string, PeriodNotice[]>();
  const add = (period: string, x: PeriodNotice) => {
    const list = byPeriod.get(period);
    if (list) list.push(x);
    else byPeriod.set(period, [x]);
  };
  const storedKeys = new Set<string>();
  for (const s of stored) {
    const period = toIsoDay(s.periodStart);
    storedKeys.add(`${period}|${s.lotId}`);
    add(period, { lotId: s.lotId, cents: toCents(String(s.amountDue)), insuranceSplit: s.insuranceAmount != null });
  }
  for (const p of input.notices) {
    const period = toIsoDay(p.periodStart);
    if (p.amountCents === undefined || !period || storedKeys.has(`${period}|${p.lotId}`)) continue;
    add(period, { lotId: p.lotId, cents: p.amountCents, insuranceSplit: false });
  }
  return input.notices.map((n) => {
    const period = toIsoDay(n.periodStart);
    if (!period) return null;
    return buildEveryLot({
      lotId: n.lotId,
      lots: lotRows,
      periodNotices: byPeriod.get(period) ?? [],
      schedule: { budgetCents: toCents(String(schedule.budgetAmount)), levyType: String(schedule.levyType), totalEntitlement: Number(schedule.totalEntitlement) },
      fundName: input.fund!.name,
      words,
      sharedByEntitlement: !input.rules.CONTRIBUTION_INSURANCE,
    });
  });
}

export async function noticeContext(schemeId: string, fundId: string, issuerId: string) {
  const [scheme, fund, issuer] = await Promise.all([
    db.orm.public.Scheme.where((s) => s.id.eq(schemeId)).first(),
    db.orm.public.Fund.where((f) => f.id.eq(fundId)).first(),
    db.orm.public.Profile.where((p) => p.id.eq(issuerId)).first(),
  ]);
  // The fund's bank account, else the scheme's operating account.
  const accounts = await db.orm.public.SchemeBankAccount.where((a) => and(a.schemeId.eq(schemeId), a.isActive.eq(true))).limit(20).all();
  const account = accounts.find((a) => a.id === fund?.bankAccountId) ?? accounts.find((a) => a.isOperating) ?? null;
  return { scheme, fund, issuer, account };
}

/** Check every planned notice. Returns the distinct missing items, if any. */
export async function checkPlannedNotices(input: {
  schemeId: string;
  fundId: string;
  issuerId: string;
  noticeDate: string;
  isUrgentSpecialLevy?: boolean;
  /**
   * The schedule the notices are raised under, so a pack that requires each
   * other unit's contribution (the ACT) can have it stated. Without it (or a
   * notice's period) that content is not stated, and such a pack refuses.
   */
  levyScheduleId?: string;
  notices: PlannedNotice[];
}): Promise<MissingItem[]> {
  const { scheme, fund, issuer, account } = await noticeContext(input.schemeId, input.fundId, input.issuerId);
  if (!scheme) throw new SchemeNotFoundError();
  // The building's own notice rules (throws for a state with no rule pack).
  const { rules } = rulesForState(scheme.state);
  const rule = rules.NOTICE_RULES;
  // The late charge the notices state, from the pack's LATE_CHARGE and the building's setting.
  const setting = await getSchemeInterestSetting(input.schemeId);
  // An annual-rate late charge (VIC, ACT and WA) has no notice wording yet (noticeLateCharge refuses it):
  // the notice states none, so the check below asks for it rather than throwing.
  const lateCharge = rules.LATE_CHARGE.annual ? null : noticeLateCharge(rules.LATE_CHARGE, setting);
  const statesLateCharge = lateCharge != null && lateChargeSentence(lateCharge, rules.TERMINOLOGY) != null;
  // What a pack's checked notice rules may require beyond the usual items (VIC, ACT and WA stage 2, PR 6a).
  // The notice states the late charge where it can (never an annual-rate one yet). Where the pack requires
  // them (the ACT, PR 6b), it states each other unit's contribution, the fund and its totals, and the unit's
  // proportion and how it is worked out, each only where the data for that notice is there (see
  // loadEveryLot). It states none of the others (the instalment dates, a discount, the obligation to pay
  // within a number of days, the dispute process), so a pack that requires one refuses the notice.
  const states = { LATE_CHARGE_STATEMENT: statesLateCharge };
  const ledgerFund = ledgerFundOf(fund?.fundType ?? null);
  const everyLot = everyLotRequired(rule)
    ? await loadEveryLot({ schemeId: input.schemeId, rules, fund: fund ? { id: fund.id, name: fund.name ?? null } : null, levyScheduleId: input.levyScheduleId, notices: input.notices })
    : null;
  const owners = await ownerNames(input.notices.map((n) => n.ownerId).filter((x): x is string => !!x));
  const rollNames = await rollOwnerNames(input.notices.map((n) => n.lotId));
  const seen = new Map<string, MissingItem>();
  for (const [i, n] of input.notices.entries()) {
    const items = validateLevyNoticeContent({
      scheme: { name: scheme?.name ?? null, planNumber: scheme?.planNumber ?? null },
      lotNumber: n.lotNumber,
      ownerNames: noticeOwnerNames(n.ownerId ? owners.get(n.ownerId)?.name : null, rollNames.get(n.lotId)),
      noticeDate: input.noticeDate,
      dueDate: n.dueDate,
      fundName: fund?.name ?? null,
      amountCents: n.amountCents,
      isUrgentSpecialLevy: input.isUrgentSpecialLevy,
      payment: {
        accountName: account?.accountName ?? null,
        bsb: account?.bsb ?? null,
        accountNumber: account?.accountNumber ?? null,
        reference: n.noticeNumber,
      },
      contact: {
        name: issuer ? `${issuer.firstName ?? ""} ${issuer.lastName ?? ""}`.trim() || null : null,
        emailOrPhone: issuer?.email ?? null,
      },
      // The notice email always carries the ledger access (see levyNoticeEmail), the late
      // charge whenever one is stated, and the hardship statement whenever the pack has one.
      includesInterestWarning: statesLateCharge,
      lateChargeApplies: lateChargeApplies(rules.LATE_CHARGE, setting),
      includesHardshipStatement: rule.hardship != null,
      includesLedgerAccess: true,
      ledgerFund,
      states: everyLot ? { ...states, ...everyLotStates(everyLot[i], ledgerFund) } : states,
    }, rule, rules.TERMINOLOGY, noticeFundWords(rules));
    for (const item of items) {
      // Each point a pack's checked notice rules refuse on is listed (they share one code).
      const key = item.code === "NOTICE_RULES_NOT_CONFIRMED" ? `${item.code}:${item.message}` : item.code;
      if (item.code === "OWNER") {
        seen.set(`OWNER:${n.lotNumber}`, {
          code: "OWNER",
          message: `Lot ${n.lotNumber} has no owner name on the strata roll. Add the owner on the lot's page (Lots, then Lot ${n.lotNumber}, then Assign owner).`,
        });
      } else if (!seen.has(key)) {
        seen.set(key, item);
      }
    }
  }
  // The PDF and email state the late charge through noticeLateCharge, which cannot word an annual-rate one
  // yet (VIC, ACT and WA): such a notice would be issued and posted but never sent, so it is refused here,
  // whatever the pack requires the notice to state. Every issuing path checks its notices here first.
  if (rules.LATE_CHARGE.annual) {
    seen.set("LATE_CHARGE_WORDING", {
      code: "LATE_CHARGE_WORDING",
      message: `Notices cannot state this building's ${rules.TERMINOLOGY.lateCharge} yet (${rules.LATE_CHARGE.source}), so no notice can be issued until they can.`,
    });
  }
  return [...seen.values()];
}

/**
 * The owner's name for a notice: the owner's account name, or else the name
 * on the strata roll entered at onboarding. A notice can be issued to a named
 * owner who has no account yet; only email delivery needs one (financials
 * review B6, 26 Oct 2026).
 */
export function noticeOwnerNames(accountName: string | null | undefined, rollName: string | null | undefined): string[] {
  const name = (accountName ?? "").trim() || (rollName ?? "").trim();
  return name ? [name] : [];
}

/** Owner names as they appear on the strata roll, by lot. */
export async function rollOwnerNames(lotIds: string[]) {
  const map = new Map<string, string>();
  const ids = [...new Set(lotIds)];
  if (ids.length === 0) return map;
  const rows = await db.orm.public.LotDetail.where((d) => d.lotId.in(ids)).limit(ids.length).all();
  for (const d of rows) if (d.rollOwnerName?.trim()) map.set(d.lotId, d.rollOwnerName.trim());
  return map;
}

export async function ownerNames(profileIds: string[]) {
  const map = new Map<string, { name: string; email: string | null }>();
  if (profileIds.length === 0) return map;
  const rows = await db.orm.public.Profile.where((p) => p.id.in([...new Set(profileIds)])).limit(5000).all();
  for (const p of rows) map.set(p.id, { name: `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() || p.email, email: p.email ?? null });
  return map;
}

/** Email each issued notice to its owner. Never throws: a failed email does not undo the issue. */
export async function sendIssuedNotices(input: {
  schemeId: string;
  fundId: string;
  issuerId: string;
  noticeDate: string;
  notices: PlannedNotice[];
  /** Called for each notice whose email was accepted, so it is not sent again. */
  onSent?: (noticeId: string) => Promise<void>;
}): Promise<number> {
  let sent = 0;
  try {
    const { scheme, fund, issuer, account } = await noticeContext(input.schemeId, input.fundId, input.issuerId);
    if (!scheme || !fund || !account || !issuer) return 0;
    const owners = await ownerNames(input.notices.map((n) => n.ownerId).filter((x): x is string => !!x));
    const setting = await getSchemeInterestSetting(input.schemeId);
    // Where the pack requires each other unit's contribution (the ACT), the email states it too, since it
    // is sent without the PDF when the PDF fails: a notice whose content cannot be stated is not emailed.
    const everyLot = everyLotRequired(setting.rules.rules.NOTICE_RULES) ? await everyLotByNotice(input.schemeId, setting.rules.rules, fund, input.notices) : null;
    for (const n of input.notices) {
      const owner = n.ownerId ? owners.get(n.ownerId) : null;
      if (!owner?.email) continue;
      const lotContent = everyLot && n.noticeId ? (everyLot.get(n.noticeId) ?? null) : null;
      if (everyLot && !lotContent) {
        logError("[levy-notices] A notice was not emailed:", new Error(`Notice ${n.noticeNumber}: each unit's ${setting.rules.rules.TERMINOLOGY.levy} for its period cannot be stated.`));
        continue;
      }
      // Attach the notice as a PDF (stored as a financial document). The email goes without it if that fails.
      let attachments: { filename: string; content: Buffer; contentType: string }[] | undefined;
      if (n.noticeId) {
        try {
          const pdf = await generateLevyNoticePdf(n.noticeId, input.issuerId);
          if (pdf) attachments = [{ filename: pdf.fileName, content: Buffer.from(pdf.bytes), contentType: "application/pdf" }];
        } catch (err) {
          logError("[levy-notices] Could not attach the PDF:", err);
        }
      }
      const ok = await sendEmail({
        ...levyNoticeEmail({
          to: owner.email,
          ownerName: owner.name,
          schemeName: scheme.name,
          planNumber: scheme.planNumber,
          lotNumber: n.lotNumber,
          noticeNumber: n.noticeNumber,
          noticeDate: input.noticeDate,
          dueDate: n.dueDate,
          fundName: fund.name,
          amount: fromCents(n.amountCents).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          payment: { accountName: account.accountName, bsb: account.bsb, accountNumber: account.accountNumber, reference: n.noticeNumber },
          contact: {
            name: `${issuer.firstName ?? ""} ${issuer.lastName ?? ""}`.trim() || "Your strata manager",
            emailOrPhone: issuer.email,
          },
          ledgerUrl: `${APP_URL}/owner/levies`,
          ...noticeLateCharge(setting.rules.rules.LATE_CHARGE, setting),
          hardship: setting.rules.rules.NOTICE_RULES.hardship?.information ?? null,
          terms: setting.rules.rules.TERMINOLOGY,
          ...(lotContent ? { everyLot: lotContent } : {}),
        }),
        attachments,
      });
      if (ok) {
        sent += 1;
        if (n.noticeId && input.onSent) await input.onSent(n.noticeId).catch((err) => logError("[levy-notices] Could not mark a notice emailed:", err));
      }
    }
  } catch (err) {
    logError("[levy-notices] Failed to send notices:", err);
  }
  return sent;
}

/** The every-lot content of issued notices, by notice id (see loadEveryLot). */
async function everyLotByNotice(
  schemeId: string,
  rules: Parameters<typeof loadEveryLot>[0]["rules"],
  fund: { id: string; name: string | null } | null,
  notices: readonly PlannedNotice[],
): Promise<Map<string, EveryLotContent | null>> {
  const ids = notices.map((n) => n.noticeId).filter((x): x is string => !!x);
  const out = new Map<string, EveryLotContent | null>();
  if (!ids.length) return out;
  const rows = await db.orm.public.LevyNotice.where((n) => and(n.schemeId.eq(schemeId), n.id.in(ids))).limit(ids.length).all();
  for (const scheduleId of new Set(rows.map((r) => r.levyScheduleId))) {
    const mine = rows.filter((r) => r.levyScheduleId === scheduleId);
    const contents = await loadEveryLot({ schemeId, rules, fund, levyScheduleId: scheduleId, notices: mine.map((r) => ({ lotId: r.lotId, periodStart: toIsoDay(r.periodStart) })) });
    mine.forEach((r, i) => out.set(r.id, contents[i]));
  }
  return out;
}

/**
 * The two funds as the notice check names them: "administrative" and
 * "capital works" where the words read as funds on their own, else the full
 * names ("administrative fund", "sinking fund"). A pack whose short label
 * keeps "Fund" ("Sinking Fund") says its word does not read as a fund alone.
 */
export function noticeFundWords(rules: Pick<StatutoryRules, "FUND_CATALOGUE">): { admin: string; capitalWorks: string } {
  const admin = ledgerFundDefinition(rules, "ADMINISTRATIVE");
  const capitalWorks = ledgerFundDefinition(rules, "CAPITAL_WORKS");
  const keepFund = [admin, capitalWorks].some((f) => /\bfund$/i.test(f.shortLabel ?? ""));
  const word = (name: string) => (keepFund ? name : name.replace(/ fund$/, ""));
  return { admin: word(admin.name), capitalWorks: word(capitalWorks.name) };
}
