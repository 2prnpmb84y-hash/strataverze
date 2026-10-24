/**
 * A lot's levies as its owner sees them (server side): the issued notices,
 * the totals and the levy statement. The Adviser's "Owner's view" tab on a
 * lot shows exactly this, read only.
 */
import { getLevyNoticesForLots } from "@/lib/queries/levies";
import { getLevyPaymentsForNotices } from "@/lib/queries/levy-schedules";
import { getCreditMovements } from "@/lib/finance/owner-credits";
import { buildStatement, levyItemTotals, levyItems, type LevyItem, type Statement } from "./levy-ledger";

export interface LotLevyView {
  items: LevyItem[];
  totals: ReturnType<typeof levyItemTotals>;
  statement: Statement;
}

export async function loadLotLevyView(schemeId: string, lotId: string, lotLabel: string, today: string = new Date().toISOString().slice(0, 10)): Promise<LotLevyView> {
  const notices = (await getLevyNoticesForLots([lotId])).filter((n) => n.schemeId === schemeId && String(n.status) !== "DRAFT");
  const [payments, credits] = await Promise.all([getLevyPaymentsForNotices(notices.map((n) => n.id)), getCreditMovements(schemeId, lotId)]);
  const items = levyItems(notices, today, new Map([[lotId, { label: lotLabel, schemeId }]]));
  return { items, totals: levyItemTotals(items), statement: buildStatement(notices, payments, {}, credits) };
}
