/**
 * A lot's levies as its owner sees them (server side): the issued notices,
 * the totals and the levy statement. The Adviser's "Owner's view" tab on a
 * lot shows exactly this, read only.
 */
import { getLevyNoticesForLots } from "@/lib/queries/levies";
import { schemeToday } from "@/lib/jurisdiction/scheme-time";
import { getLevyPaymentsForNotices } from "@/lib/queries/levy-schedules";
import { getCreditMovements } from "@/lib/finance/owner-credits";
import { buildStatement, levyItemTotals, levyItems, type LevyItem, type Statement } from "./levy-ledger";
import type { Terms } from "@/lib/jurisdiction/wording";

export interface LotLevyView {
  items: LevyItem[];
  totals: ReturnType<typeof levyItemTotals>;
  statement: Statement;
}

/** `terms` is the building's TERMINOLOGY, for how the statement names levies and late charges. */
export async function loadLotLevyView(schemeId: string, lotId: string, lotLabel: string, terms: Pick<Terms, "levy" | "lateCharge">, todayDay?: string): Promise<LotLevyView> {
  // Today in the building's time zone unless given.
  const today = todayDay ?? (await schemeToday(schemeId));
  const notices = (await getLevyNoticesForLots([lotId])).filter((n) => n.schemeId === schemeId && String(n.status) !== "DRAFT");
  const [payments, credits] = await Promise.all([getLevyPaymentsForNotices(notices.map((n) => n.id)), getCreditMovements(schemeId, lotId)]);
  const items = levyItems(notices, today, new Map([[lotId, { label: lotLabel, schemeId }]]));
  return { items, totals: levyItemTotals(items), statement: buildStatement(notices, payments, {}, credits, terms) };
}
