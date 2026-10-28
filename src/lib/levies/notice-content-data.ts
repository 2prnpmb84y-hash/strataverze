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
import { logActivity } from "@/lib/queries/activity-log";
import { toIsoDay } from "./notice-plan";
import { everyLotMissing, everyLotRequired, everyLotStatus, type EveryLotBuild } from "./every-lot";
import { loadEveryLot } from "./every-lot-data";

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
    // What this notice can state of each unit's contribution, the fund total and the proportion, and why not.
    const status = everyLot ? everyLotStatus(everyLot[i], ledgerFund) : null;
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
      states: status ? { ...states, ...status.states } : states,
      ...(status ? { notStated: status.reasons } : {}),
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
    // is sent without the PDF when the PDF fails. The content is checked again from the data as it is now:
    // a notice that cannot state every required part is not emailed, and the building's activity says why.
    const rule = setting.rules.rules.NOTICE_RULES;
    const everyLot = everyLotRequired(rule) ? await everyLotByNotice(input.schemeId, setting.rules.rules, fund, input.notices) : null;
    const ledgerFund = ledgerFundOf(fund.fundType ?? null);
    const notEmailed = new Map<string, { scheduleId: string | null; reason: string; notices: string[] }>();
    for (const n of input.notices) {
      const owner = n.ownerId ? owners.get(n.ownerId) : null;
      if (!owner?.email) continue;
      const found = everyLot && n.noticeId ? everyLot.get(n.noticeId) : undefined;
      const lotBuild: EveryLotBuild | null = everyLot ? (found?.build ?? { content: null, reason: "the notice was not found" }) : null;
      const missing = lotBuild ? everyLotMissing(rule, lotBuild, ledgerFund) : null;
      if (missing) {
        const key = `${found?.scheduleId ?? ""}|${missing}`;
        const entry = notEmailed.get(key) ?? { scheduleId: found?.scheduleId ?? null, reason: missing, notices: [] };
        entry.notices.push(n.noticeNumber);
        notEmailed.set(key, entry);
        continue;
      }
      const lotContent = lotBuild?.content ?? null;
      // Attach the notice as a PDF (stored as a financial document). The email goes without it if that fails.
      let attachments: { filename: string; content: Buffer; contentType: string }[] | undefined;
      if (n.noticeId) {
        try {
          // The content just checked goes into the PDF, so it is not read again for each notice.
          const pdf = lotContent ? await generateLevyNoticePdf(n.noticeId, input.issuerId, { everyLot: lotContent }) : await generateLevyNoticePdf(n.noticeId, input.issuerId);
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
    for (const e of notEmailed.values()) {
      await logActivity({
        schemeId: input.schemeId,
        actorId: input.issuerId,
        action: "LEVY_NOTICES_NOT_EMAILED",
        entityType: e.scheduleId ? "LevySchedule" : "Scheme",
        entityId: e.scheduleId ?? input.schemeId,
        metadata: { count: e.notices.length, notices: e.notices, reason: e.reason },
      }).catch((err) => logError("[levy-notices] Could not record the notices not emailed:", err));
    }
  } catch (err) {
    logError("[levy-notices] Failed to send notices:", err);
  }
  return sent;
}

/** The every-lot content of issued notices, by notice id, with each notice's schedule (see loadEveryLot). */
async function everyLotByNotice(
  schemeId: string,
  rules: Parameters<typeof loadEveryLot>[0]["rules"],
  fund: { id: string; name: string | null } | null,
  notices: readonly PlannedNotice[],
): Promise<Map<string, { scheduleId: string; build: EveryLotBuild }>> {
  const ids = notices.map((n) => n.noticeId).filter((x): x is string => !!x);
  const out = new Map<string, { scheduleId: string; build: EveryLotBuild }>();
  if (!ids.length) return out;
  const rows = await db.orm.public.LevyNotice.where((n) => and(n.schemeId.eq(schemeId), n.id.in(ids))).limit(ids.length).all();
  for (const scheduleId of new Set(rows.map((r) => r.levyScheduleId))) {
    const mine = rows.filter((r) => r.levyScheduleId === scheduleId);
    const builds = await loadEveryLot({ schemeId, rules, fund, levyScheduleId: scheduleId, notices: mine.map((r) => ({ lotId: r.lotId, periodStart: toIsoDay(r.periodStart) })) });
    mine.forEach((r, i) => out.set(r.id, { scheduleId, build: builds[i] }));
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
