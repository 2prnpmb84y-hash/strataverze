/**
 * Gather what each levy notice will state, check it against the content
 * rules, and send the notices (server side).
 */
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import { sendEmail } from "@/lib/email";
import { levyNoticeEmail } from "@/lib/email-templates/levy-notice";
import { fromCents } from "@/lib/billing/money";
import { validateLevyNoticeContent, type MissingItem } from "@/lib/finance/levy-notice-content";
import { getSchemeInterestSetting } from "@/lib/finance/interest-setting";

const APP_URL = process.env.APP_URL ?? "https://strataverze.com.au";

export interface PlannedNotice {
  lotId: string;
  lotNumber: string;
  ownerId: string | null;
  noticeNumber: string;
  dueDate: string;
  amountCents: number;
}

async function noticeContext(schemeId: string, fundId: string, issuerId: string) {
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
  notices: PlannedNotice[];
}): Promise<MissingItem[]> {
  const { scheme, fund, issuer, account } = await noticeContext(input.schemeId, input.fundId, input.issuerId);
  const owners = await ownerNames(input.notices.map((n) => n.ownerId).filter((x): x is string => !!x));
  const seen = new Map<string, MissingItem>();
  for (const n of input.notices) {
    const items = validateLevyNoticeContent({
      scheme: { name: scheme?.name ?? null, planNumber: scheme?.planNumber ?? null },
      lotNumber: n.lotNumber,
      ownerNames: n.ownerId && owners.get(n.ownerId) ? [owners.get(n.ownerId)!.name] : [],
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
      // The notice email always carries these (see levyNoticeEmail).
      includesInterestWarning: true,
      includesHardshipStatement: true,
      includesLedgerAccess: true,
    });
    for (const item of items) {
      const key = item.code;
      if (item.code === "OWNER") {
        seen.set(`OWNER:${n.lotNumber}`, { code: "OWNER", message: `Lot ${n.lotNumber} has no owner on the strata roll.` });
      } else if (!seen.has(key)) {
        seen.set(key, item);
      }
    }
  }
  return [...seen.values()];
}

async function ownerNames(profileIds: string[]) {
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
}): Promise<number> {
  let sent = 0;
  try {
    const { scheme, fund, issuer, account } = await noticeContext(input.schemeId, input.fundId, input.issuerId);
    if (!scheme || !fund || !account || !issuer) return 0;
    const owners = await ownerNames(input.notices.map((n) => n.ownerId).filter((x): x is string => !!x));
    const setting = await getSchemeInterestSetting(input.schemeId);
    for (const n of input.notices) {
      const owner = n.ownerId ? owners.get(n.ownerId) : null;
      if (!owner?.email) continue;
      const ok = await sendEmail(
        levyNoticeEmail({
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
          noInterest: setting.mode === "NO_INTEREST",
        }),
      );
      if (ok) sent += 1;
    }
  } catch (err) {
    console.error("[levy-notices] Failed to send notices:", err);
  }
  return sent;
}
