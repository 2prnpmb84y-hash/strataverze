/**
 * Financial cutover from another system (server). See migration-cutover.ts
 * for the rules. Files are parsed here, on the server, from the uploaded
 * text, and the SHA-256 of each file is kept with its rows, so what was
 * signed off is exactly what runs.
 */
import { createHash } from "node:crypto";
import { db } from "@/prisma/db";
import { and } from "@prisma/orm-postgres/orm-client";
import type { Numeric, TimestampString, Varchar } from "@prisma/orm-postgres/target/codec-types";
import { parseCSVContent } from "@/lib/queries/data-migration";
import { getNextEntryNumber, validatePeriodForPosting } from "@/lib/queries/journal-entries";
import { ensureLeviesInAdvanceAccount } from "@/lib/queries/seed-chart-of-accounts";
import { logActivity } from "@/lib/queries/activity-log";
import { financialYearStart } from "@/lib/levies/notice-plan";
import {
  CUTOVER_DATA_TYPES,
  CUTOVER_LABELS,
  cutoverDate as parseCutoverDate,
  cutoverReadiness,
  executionProblem,
  parseArrearsRow,
  parseBankRow,
  parseCreditRow,
  parseInvoiceRow,
  parseOpeningRow,
  signOffProblem,
  type CutoverDataType,
  type CutoverFile,
  type CutoverRows,
  type Lookups,
  type ParsedRow,
  type Readiness,
  type SignOff,
} from "./migration-cutover";
import { COLUMN_TEMPLATES, FIELDS, missingFields, suggestMapping, toRecords } from "./migration-templates";

const ts = (v: string) => v as unknown as TimestampString<3>;
const varchar = <N extends number>(v: string) => v as unknown as Varchar<N>;
const money = (cents: number) => String(cents / 100) as unknown as Numeric<12, 2>;
const isoDay = (v: unknown) => String(v ?? "").slice(0, 10);
type Json = Parameters<typeof db.orm.public.MigrationBatch.create>[0]["files"];
const json = (v: unknown) => v as Json;

export class CutoverError extends Error {}

export const SOURCE_SYSTEMS: Array<{ value: string; label: string }> = [
  { value: "stratamax", label: "StrataMax" },
  { value: "strata_master", label: "Strata Master (MRI Software)" },
  { value: "myob", label: "MYOB" },
  { value: "xero", label: "Xero" },
  { value: "other", label: "Other" },
];

export interface StagedFile {
  fileName: string;
  sha256: string;
  headers: string[];
  mapping: Record<string, number>;
  records: Record<string, string>[];
  stagedBy: string;
  stagedAt: string;
}
export type StagedFiles = Partial<Record<CutoverDataType, StagedFile>>;

export const sha256Text = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

/** Everything a cutover file is checked against, for one scheme. */
export async function loadCutoverLookups(schemeId: string): Promise<Lookups & { lotEntitlement: Map<string, number> }> {
  const [accounts, funds, lots, suppliers, bankAccounts] = await Promise.all([
    db.orm.public.AccountCode.where((a) => and(a.schemeId.eq(schemeId), a.isActive.eq(true))).limit(2000).all(),
    db.orm.public.Fund.where((f) => and(f.schemeId.eq(schemeId), f.isActive.eq(true))).limit(50).all(),
    db.orm.public.Lot.where((l) => l.schemeId.eq(schemeId)).limit(5000).all(),
    db.orm.public.Supplier.where((s) => s.schemeId.eq(schemeId)).limit(5000).all(),
    db.orm.public.SchemeBankAccount.where((b) => and(b.schemeId.eq(schemeId), b.isActive.eq(true))).limit(100).all(),
  ]);
  return {
    accounts: accounts.map((a) => ({ id: a.id, code: String(a.code), accountType: String(a.accountType), accountSubType: a.accountSubType ?? null, fundId: a.fundId ?? null })),
    funds: funds.map((f) => ({ id: f.id, name: String(f.name), fundType: String(f.fundType) })),
    lots: lots.map((l) => ({ id: l.id, lotNumber: String(l.lotNumber) })),
    suppliers: suppliers.map((s) => ({ id: s.id, companyName: String(s.companyName), abn: s.abn ? String(s.abn) : null })),
    bankAccounts: bankAccounts.map((b) => ({ id: b.id, accountName: String(b.accountName), bsb: String(b.bsb), accountNumber: String(b.accountNumber) })),
    lotEntitlement: new Map(lots.map((l) => [l.id, Number(l.entitlement)])),
  };
}

export interface CutoverEvaluation {
  rows: CutoverRows;
  files: CutoverFile[];
  readiness: Readiness;
}

/** Parse every staged file against the scheme as it is now, and check the cutover. */
export function evaluateCutover(staged: StagedFiles, lookups: Lookups, cutover: string | null): CutoverEvaluation {
  const rows: CutoverRows = {};
  const parse = <T>(records: Record<string, string>[], fn: (r: Record<string, string>, n: number) => ParsedRow<T>) => records.map((r, i) => fn(r, i + 2));
  const date = cutover ?? "9999-12-31";
  for (const t of CUTOVER_DATA_TYPES) {
    const f = staged[t];
    if (!f) continue;
    if (t === "opening_balances") rows.opening_balances = parse(f.records, (r, n) => parseOpeningRow(r, n, lookups));
    if (t === "levy_arrears") rows.levy_arrears = parse(f.records, (r, n) => parseArrearsRow(r, n, lookups, date));
    if (t === "unpaid_invoices") rows.unpaid_invoices = parse(f.records, (r, n) => parseInvoiceRow(r, n, lookups));
    if (t === "owner_credits") rows.owner_credits = parse(f.records, (r, n) => parseCreditRow(r, n, lookups));
    if (t === "bank_balances") rows.bank_balances = parse(f.records, (r, n) => parseBankRow(r, n, lookups));
  }
  const files: CutoverFile[] = CUTOVER_DATA_TYPES.filter((t) => staged[t]).map((t) => {
    const list = (rows[t] ?? []) as ParsedRow<unknown>[];
    return { dataType: t, fileName: staged[t]!.fileName, sha256: staged[t]!.sha256, rowCount: list.length, errorCount: list.filter((r) => r.errors.length > 0).length };
  });
  return { rows, files, readiness: cutoverReadiness({ files, rows, funds: lookups.funds, cutoverDate: cutover }) };
}

async function loadBatch(schemeId: string, batchId: string) {
  const batch = await db.orm.public.MigrationBatch.where((b) => and(b.id.eq(batchId), b.schemeId.eq(schemeId))).first();
  if (!batch) throw new CutoverError("This cutover could not be found.");
  return batch;
}

const stagedOf = (batch: { files: unknown }) => (batch.files ?? {}) as StagedFiles;
const cutoverOf = (batch: { cutoverDate: unknown }) => (batch.cutoverDate ? isoDay(batch.cutoverDate) : null);

export async function listCutovers(schemeId: string) {
  return db.orm.public.MigrationBatch.where((b) => b.schemeId.eq(schemeId)).orderBy((b) => b.createdAt.desc()).limit(50).all();
}

export async function createCutover(input: { schemeId: string; sourceSystem: string; cutoverDate: string | null; actorId: string }): Promise<string> {
  if (!SOURCE_SYSTEMS.some((s) => s.value === input.sourceSystem)) throw new CutoverError("Choose the system the data comes from.");
  const date = input.cutoverDate ? parseCutoverDate(input.cutoverDate) : null;
  if (input.cutoverDate && !date) throw new CutoverError("The cutover date is not a date.");
  const row = await db.orm.public.MigrationBatch.create({
    schemeId: input.schemeId,
    sourceSystem: input.sourceSystem,
    cutoverDate: date ? ts(date) : null,
    status: "DRAFT",
    files: json({}),
    createdBy: input.actorId,
  });
  return row.id;
}

/** Any change to a signed-off cutover clears the sign-off: it must be signed again. */
async function saveDraft(batchId: string, values: { files?: Json; cutoverDate?: TimestampString<3> }) {
  await db.orm.public.MigrationBatch.where({ id: batchId }).update({
    ...values,
    status: "DRAFT",
    signOff: null,
    signedOffBy: null,
    signedOffAt: null,
    updatedAt: ts(new Date().toISOString()),
  });
}

export async function setCutoverDate(schemeId: string, batchId: string, value: string) {
  const batch = await loadBatch(schemeId, batchId);
  if (batch.status === "EXECUTED") throw new CutoverError("This cutover has already been executed.");
  const date = parseCutoverDate(value);
  if (!date) throw new CutoverError("The cutover date is not a date.");
  await saveDraft(batch.id, { cutoverDate: ts(date) });
}

export interface StageResult {
  headers: string[];
  mapping: Record<string, number>;
  missing: string[];
  staged: boolean;
}

/**
 * Stage one file. Without a mapping, suggests one from the template and the
 * headers and stages it only if nothing required is missing. With a mapping
 * (the adviser's confirmed columns), stages with that.
 */
export async function stageCutoverFile(input: {
  schemeId: string;
  batchId: string;
  dataType: CutoverDataType;
  fileName: string;
  content: string;
  mapping?: Record<string, number>;
  actorId: string;
}): Promise<StageResult> {
  const batch = await loadBatch(input.schemeId, input.batchId);
  if (batch.status === "EXECUTED") throw new CutoverError("This cutover has already been executed.");
  if (!CUTOVER_DATA_TYPES.includes(input.dataType)) throw new CutoverError("Unknown file type.");
  if (input.content.length > 5_000_000) throw new CutoverError("The file is larger than 5 MB.");
  const { headers, rows } = parseCSVContent(input.content.replace(/^﻿/, ""));
  if (headers.length === 0) throw new CutoverError("The file is empty.");
  if (rows.length > 20_000) throw new CutoverError("The file has more than 20,000 rows.");
  const mapping = input.mapping ?? suggestMapping(headers, input.dataType, batch.sourceSystem);
  for (const [field, index] of Object.entries(mapping)) {
    if (!FIELDS[input.dataType].some((f) => f.field === field) || !Number.isInteger(index) || index < 0 || index >= headers.length) {
      throw new CutoverError(`The column chosen for "${field}" is not in the file.`);
    }
  }
  const missing = missingFields(mapping, input.dataType);
  if (missing.length > 0) return { headers, mapping, missing, staged: false };
  const file: StagedFile = {
    fileName: input.fileName.slice(0, 300),
    sha256: sha256Text(input.content),
    headers,
    mapping,
    records: toRecords(rows, mapping, input.dataType),
    stagedBy: input.actorId,
    stagedAt: new Date().toISOString(),
  };
  await saveDraft(batch.id, { files: json({ ...stagedOf(batch), [input.dataType]: file }) });
  return { headers, mapping, missing, staged: true };
}

export async function removeCutoverFile(schemeId: string, batchId: string, dataType: CutoverDataType) {
  const batch = await loadBatch(schemeId, batchId);
  if (batch.status === "EXECUTED") throw new CutoverError("This cutover has already been executed.");
  const files = { ...stagedOf(batch) };
  delete files[dataType];
  await saveDraft(batch.id, { files: json(files) });
}

export interface CutoverView {
  id: string;
  sourceSystem: string;
  sourceLabel: string;
  template: { status: string; note: string; references: Array<{ title: string; url: string }> } | null;
  cutoverDate: string | null;
  status: string;
  staged: Array<{ dataType: CutoverDataType; label: string; fileName: string; sha256: string; stagedAt: string; mapping: Record<string, string> }>;
  evaluation: CutoverEvaluation;
  signOff: SignOff | null;
  results: Record<string, unknown> | null;
  executedAt: string | null;
}

export async function getCutoverView(schemeId: string, batchId: string): Promise<CutoverView> {
  const batch = await loadBatch(schemeId, batchId);
  const lookups = await loadCutoverLookups(schemeId);
  const staged = stagedOf(batch);
  const template = COLUMN_TEMPLATES[batch.sourceSystem];
  return {
    id: batch.id,
    sourceSystem: batch.sourceSystem,
    sourceLabel: SOURCE_SYSTEMS.find((s) => s.value === batch.sourceSystem)?.label ?? batch.sourceSystem,
    template: template ? { status: template.status, note: template.note, references: template.references } : null,
    cutoverDate: cutoverOf(batch),
    status: batch.status,
    staged: CUTOVER_DATA_TYPES.filter((t) => staged[t]).map((t) => ({
      dataType: t,
      label: CUTOVER_LABELS[t],
      fileName: staged[t]!.fileName,
      sha256: staged[t]!.sha256,
      stagedAt: staged[t]!.stagedAt,
      mapping: Object.fromEntries(Object.entries(staged[t]!.mapping).map(([field, i]) => [field, staged[t]!.headers[i] ?? `column ${i + 1}`])),
    })),
    evaluation: evaluateCutover(staged, lookups, cutoverOf(batch)),
    signOff: (batch.signOff as unknown as SignOff | null) ?? null,
    results: (batch.results as unknown as Record<string, unknown> | null) ?? null,
    executedAt: batch.executedAt ? String(batch.executedAt) : null,
  };
}

/** Record the sign-off: who, when, the source system, the cutover date, every file's hash and each acknowledged difference. */
export async function signOffCutover(input: { schemeId: string; batchId: string; actorId: string; acknowledged: string[]; note: string | null }): Promise<SignOff> {
  const batch = await loadBatch(input.schemeId, input.batchId);
  if (batch.status === "EXECUTED") throw new CutoverError("This cutover has already been executed.");
  const lookups = await loadCutoverLookups(input.schemeId);
  const cutover = cutoverOf(batch);
  const evaluation = evaluateCutover(stagedOf(batch), lookups, cutover);
  const problem = signOffProblem(evaluation.readiness, input.acknowledged);
  if (problem) throw new CutoverError(problem);
  const now = new Date().toISOString();
  const signOff: SignOff = {
    signedOffBy: input.actorId,
    signedOffAt: now,
    sourceSystem: batch.sourceSystem,
    cutoverDate: cutover!,
    files: evaluation.files.map((f) => ({ dataType: f.dataType, fileName: f.fileName, sha256: f.sha256 })),
    acknowledgedDifferences: evaluation.readiness.tieOuts
      .filter((t) => t.needsAcknowledgement && t.differenceCents !== 0)
      .map((t) => ({ key: t.key, control: t.control, differenceCents: t.differenceCents })),
    note: input.note?.trim().slice(0, 2000) || null,
  };
  await db.orm.public.MigrationBatch.where({ id: batch.id }).update({
    status: "SIGNED_OFF",
    signOff: json(signOff),
    signedOffBy: input.actorId,
    signedOffAt: ts(now),
    updatedAt: ts(now),
  });
  await logActivity({
    schemeId: input.schemeId,
    actorId: input.actorId,
    action: "DATA_MIGRATION_SIGNED_OFF",
    entityType: "MigrationBatch",
    entityId: batch.id,
    metadata: { ...signOff },
  });
  return signOff;
}

/** The financial year (by its start year) a date falls in. */
function financialYearOf(date: string, financialYearEnd: string): number {
  const y = Number(date.slice(0, 4));
  return financialYearStart(y, financialYearEnd) <= date ? y : y - 1;
}

/**
 * Run a signed-off cutover in one transaction: post the opening trial balance,
 * and create the brought-forward notices, invoices, owner credits and bank
 * reconciled balances. Every gate is checked again first.
 */
export async function executeCutover(input: { schemeId: string; batchId: string; actorId: string }) {
  const batch = await loadBatch(input.schemeId, input.batchId);
  const lookups = await loadCutoverLookups(input.schemeId);
  const cutover = cutoverOf(batch);
  const evaluation = evaluateCutover(stagedOf(batch), lookups, cutover);
  const problem = executionProblem({ status: batch.status, readiness: evaluation.readiness, signOff: (batch.signOff as unknown as SignOff | null) ?? null, files: evaluation.files });
  if (problem) throw new CutoverError(problem);
  const date = cutover!;

  const [scheme, executed, ownerMemberships, existingNotices, existingInvoices] = await Promise.all([
    db.orm.public.Scheme.where((s) => s.id.eq(input.schemeId)).first(),
    db.orm.public.MigrationBatch.where((b) => and(b.schemeId.eq(input.schemeId), b.status.eq("EXECUTED"))).first(),
    db.orm.public.SchemeMembership.where((m) => and(m.schemeId.eq(input.schemeId), m.role.eq("OWNER"), m.isActive.eq(true))).limit(10000).all(),
    db.orm.public.LevyNotice.where((n) => n.schemeId.eq(input.schemeId)).limit(100000).all(),
    db.orm.public.SupplierInvoice.where((i) => i.schemeId.eq(input.schemeId)).limit(100000).all(),
  ]);
  if (!scheme) throw new CutoverError("Scheme not found.");
  if (executed) throw new CutoverError("A cutover has already been executed for this scheme.");
  await validatePeriodForPosting(input.schemeId, date, "OPENING_BALANCE");

  const value = <T>(list: ParsedRow<T>[] | undefined) => (list ?? []).flatMap((r) => (r.value ? [r.value] : []));
  const opening = value(evaluation.rows.opening_balances).filter((l) => l.debitCents > 0 || l.creditCents > 0);
  const arrears = value(evaluation.rows.levy_arrears);
  const invoices = value(evaluation.rows.unpaid_invoices);
  const credits = value(evaluation.rows.owner_credits);
  const banks = value(evaluation.rows.bank_balances);

  // Numbers for brought-forward notices: the old system's number, marked, or one made from the lot.
  const taken = new Set(existingNotices.map((n) => String(n.noticeNumber).toLowerCase()));
  const perLot = new Map<string, number>();
  const noticeNumbers = arrears.map((a) => {
    const n = (perLot.get(a.lotNumber) ?? 0) + 1;
    perLot.set(a.lotNumber, n);
    const num = (a.noticeNumber ? `BF-${a.noticeNumber}` : `BF-L${a.lotNumber}-${n}`).slice(0, 20);
    if (taken.has(num.toLowerCase())) throw new CutoverError(`Notice number ${num} is already used in this scheme.`);
    taken.add(num.toLowerCase());
    return num;
  });
  for (const i of invoices) {
    if (existingInvoices.some((x) => x.supplierId === i.supplierId && String(x.invoiceNumber).toLowerCase() === i.invoiceNumber.toLowerCase())) {
      throw new CutoverError(`Invoice ${i.invoiceNumber} is already recorded for that supplier.`);
    }
  }
  const ownerOf = (lotId: string) => ownerMemberships.find((m) => m.lotId === lotId)?.profileId ?? null;
  // Owner credits sit in levies paid in advance: make sure each fund has that account.
  for (const fundId of new Set(credits.map((c) => c.fundId))) await ensureLeviesInAdvanceAccount(input.schemeId, fundId);
  const entryNumber = await getNextEntryNumber(input.schemeId);
  const fy = financialYearOf(date, String(scheme.financialYearEnd ?? "06-30"));
  const sourceLabel = SOURCE_SYSTEMS.find((s) => s.value === batch.sourceSystem)?.label ?? batch.sourceSystem;
  const now = new Date().toISOString();

  const results = await db.transaction(async (tx) => {
    // 1. The opening trial balance, posted.
    const entry = await tx.orm.public.JournalEntry.create({
      schemeId: input.schemeId,
      entryNumber: varchar<20>(entryNumber),
      transactionDate: ts(date),
      description: varchar<500>(`Opening balances brought forward from ${sourceLabel} at ${date}`),
      entryType: "OPENING_BALANCE",
      sourceType: "DATA_MIGRATION",
      sourceId: batch.id,
      status: "POSTED",
      postedAt: ts(now),
      postedBy: input.actorId,
      createdBy: input.actorId,
    });
    for (const l of opening) {
      await tx.orm.public.JournalLine.create({
        journalEntryId: entry.id,
        accountCodeId: l.accountId,
        fundId: l.fundId,
        debit: l.debitCents > 0 ? money(l.debitCents) : null,
        credit: l.creditCents > 0 ? money(l.creditCents) : null,
        description: l.description ? varchar<500>(l.description.slice(0, 500)) : null,
      });
    }

    // 2. Outstanding levy notices, with their original due dates, under one brought-forward schedule per fund.
    const noticeIds: string[] = [];
    for (const fundId of new Set(arrears.map((a) => a.fundId))) {
      const list = arrears.map((a, i) => ({ a, i })).filter((x) => x.a.fundId === fundId);
      const lotIds = [...new Set(list.map((x) => x.a.lotId))];
      const schedule = await tx.orm.public.LevySchedule.create({
        schemeId: input.schemeId,
        fundId,
        financialYear: fy,
        budgetAmount: money(list.reduce((s, x) => s + x.a.levyOutstandingCents, 0)),
        frequency: "ONE_OFF",
        levyType: "BROUGHT_FORWARD",
        title: `Levies brought forward from ${sourceLabel}`,
        description: `Outstanding at the cutover on ${date}. The levies were raised in ${sourceLabel}; interest continues from each original due date.`,
        totalLots: lotIds.length,
        totalEntitlement: String(lotIds.reduce((s, id) => s + (lookups.lotEntitlement.get(id) ?? 0), 0)) as unknown as Numeric<10, 2>,
        status: "MIGRATED",
        migrationBatchId: batch.id,
      });
      for (const { a, i } of list) {
        const n = await tx.orm.public.LevyNotice.create({
          schemeId: input.schemeId,
          levyScheduleId: schedule.id,
          lotId: a.lotId,
          ownerId: ownerOf(a.lotId),
          fundId,
          noticeNumber: varchar<20>(noticeNumbers[i]),
          periodStart: ts(a.periodStart ?? a.dueDate),
          periodEnd: ts(a.periodEnd ?? a.dueDate),
          dueDate: ts(a.dueDate),
          amountDue: money(a.levyOutstandingCents),
          amountPaid: money(a.interestPaidCents),
          balanceOutstanding: money(a.levyOutstandingCents + a.interestChargedCents - a.interestPaidCents),
          interestCharged: money(a.interestChargedCents),
          status: "ISSUED",
          issuedAt: ts(`${date}T00:00:00.000Z`),
          migrationBatchId: batch.id,
        });
        noticeIds.push(n.id);
      }
    }

    // 3. Unpaid supplier invoices, already approved in the old system. Their payable is in the opening balances.
    const invoiceIds: string[] = [];
    for (const i of invoices) {
      const inv = await tx.orm.public.SupplierInvoice.create({
        schemeId: input.schemeId,
        supplierId: i.supplierId,
        invoiceNumber: varchar<50>(i.invoiceNumber.slice(0, 50)),
        invoiceDate: ts(i.invoiceDate),
        dueDate: ts(i.dueDate),
        subtotal: money(i.totalCents - i.gstCents),
        gstAmount: money(i.gstCents),
        totalAmount: money(i.totalCents),
        amountPaid: money(i.paidCents),
        balanceOutstanding: money(i.totalCents - i.paidCents),
        fundId: i.fundId,
        accountCodeId: i.accountId,
        description: varchar<500>(`${i.description} (brought forward from ${sourceLabel})`.slice(0, 500)),
        status: i.paidCents > 0 ? "PARTIALLY_PAID" : "APPROVED",
        approvedAt: ts(`${date}T00:00:00.000Z`),
        preparedById: null,
        migrationBatchId: batch.id,
      });
      invoiceIds.push(inv.id);
    }

    // 4. Owner credits, held in levies paid in advance (already in the opening balances).
    for (const c of credits) {
      await tx.orm.public.OwnerCreditTransaction.create({
        schemeId: input.schemeId,
        lotId: c.lotId,
        fundId: c.fundId,
        ownerId: ownerOf(c.lotId),
        type: "ADJUSTED",
        amount: money(c.amountCents),
        effectiveDate: ts(date),
        note: c.note ?? `Credit brought forward from ${sourceLabel} at ${date}`,
        createdBy: input.actorId,
        migrationBatchId: batch.id,
      });
      const existing = await tx.orm.public.OwnerCreditBalance.where((b) => and(b.schemeId.eq(input.schemeId), b.lotId.eq(c.lotId), b.fundId.eq(c.fundId))).first();
      if (existing) {
        await tx.orm.public.OwnerCreditBalance.where((b) => b.id.eq(existing.id)).update({
          balance: money(Math.round(Number(existing.balance) * 100) + c.amountCents),
          updatedAt: ts(now),
        });
      } else {
        await tx.orm.public.OwnerCreditBalance.create({ schemeId: input.schemeId, lotId: c.lotId, fundId: c.fundId, ownerId: ownerOf(c.lotId), balance: money(c.amountCents), updatedAt: ts(now) });
      }
    }

    // 5. Each bank account's last reconciled balance and date, the starting point for reconciliation here.
    for (const b of banks) {
      await tx.orm.public.SchemeBankAccount.where((x) => x.id.eq(b.bankAccountId)).update({
        lastReconciledDate: ts(b.reconciledDate),
        lastReconciledBalance: money(b.reconciledBalanceCents),
      });
    }

    const out = {
      journalEntryId: entry.id,
      entryNumber,
      openingLines: opening.length,
      notices: noticeIds.length,
      invoices: invoiceIds.length,
      credits: credits.length,
      bankAccounts: banks.length,
    };
    await tx.orm.public.MigrationBatch.where({ id: batch.id }).update({
      status: "EXECUTED",
      results: json(out),
      executedBy: input.actorId,
      executedAt: ts(now),
      updatedAt: ts(now),
    });
    return out;
  });

  await logActivity({
    schemeId: input.schemeId,
    actorId: input.actorId,
    action: "DATA_MIGRATION_EXECUTED",
    entityType: "MigrationBatch",
    entityId: batch.id,
    metadata: { ...results, sourceSystem: batch.sourceSystem, cutoverDate: date, files: evaluation.files.map((f) => ({ dataType: f.dataType, sha256: f.sha256 })) },
  });
  return results;
}
