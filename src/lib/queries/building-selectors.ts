/**
 * A building's recorded selector values and the facts its derived selectors
 * read (VIC, ACT and WA stage 2, PR 2, 28 Oct 2026). The values are checked
 * against the pack by the caller (readBuildingRulesForm); this module only
 * reads and writes them, always scoped to the building.
 */
import { and } from "@prisma/orm-postgres/orm-client";
import type { Numeric, TimestampString } from "@prisma/orm-postgres/target/codec-types";
import { db } from "@/prisma/db";
import type { BuildingRulesInput, RecordedValues, SelectorBuilding } from "@/lib/jurisdiction/building-selectors";

/** A lot the form named is not one of the building's lots: nothing is saved. */
export class BuildingRulesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuildingRulesError";
  }
}

/** The building's recorded selector values, by key. */
export async function getRecordedSelectorValues(schemeId: string, orm: typeof db.orm = db.orm): Promise<RecordedValues> {
  const rows = await orm.public.SchemeSelectorValue.where((v) => v.schemeId.eq(schemeId)).all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/**
 * The building as its selectors and fund conditions read it (stage 2, PR 3):
 * the scheme's facts, its lots and its recorded selector values. Null when
 * there is no such building. For a page that does not already hold them.
 */
export async function selectorBuildingFor(schemeId: string, orm: typeof db.orm = db.orm): Promise<SelectorBuilding | null> {
  const scheme = await orm.public.Scheme.where((s) => s.id.eq(schemeId)).first();
  if (!scheme) return null;
  const lots = await orm.public.Lot.where((l) => l.schemeId.eq(schemeId)).all();
  return { scheme, lots, recorded: await getRecordedSelectorValues(schemeId, orm) };
}

/** What changed, for the activity log: the keys of the selectors and facts saved. */
export interface BuildingRulesChange {
  selectors: string[];
  servicesOnly: boolean;
  replacementCost: boolean;
  lots: number;
}

/**
 * Saves the building rules in one transaction, with the building's row locked
 * so two saves for the same building, or a save and a state change, do not
 * interleave. Refused if the building's state is no longer the one the values
 * were checked for. A selector value of
 * null deletes the recorded value. Each lot is updated only where it belongs
 * to the building, or nothing is saved.
 */
export async function saveBuildingRules(schemeId: string, input: BuildingRulesInput, actorId: string, checkedForState: string): Promise<BuildingRulesChange> {
  return db.transaction(async (tx) => {
    // The values were checked against the pack for `checkedForState`. Read
    // the state again under the lock (a state change takes the same lock), and
    // refuse if it changed, so nothing is saved under another state's rules.
    const locked = await tx.orm.public.Scheme.where((s) => s.id.eq(schemeId)).forNoKeyUpdate().first();
    if (!locked) throw new BuildingRulesError("Scheme not found.");
    if (locked.state !== checkedForState) throw new BuildingRulesError("The building's state changed while this was being saved. Reload the page and try again.");
    const change: BuildingRulesChange = { selectors: [], servicesOnly: false, replacementCost: false, lots: 0 };
    for (const [key, value] of Object.entries(input.selectors)) {
      const scoped = tx.orm.public.SchemeSelectorValue.where((v) => and(v.schemeId.eq(schemeId), v.key.eq(key)));
      const existing = await scoped.first();
      if (value == null) {
        if (existing) {
          await scoped.deleteAndCount();
          change.selectors.push(key);
        }
        continue;
      }
      if (existing?.value === value) continue;
      if (existing) await scoped.updateAndCount({ value, recordedBy: actorId, recordedAt: new Date().toISOString() as unknown as TimestampString<3> });
      else await tx.orm.public.SchemeSelectorValue.create({ schemeId, key, value, recordedBy: actorId });
      change.selectors.push(key);
    }
    const schemeData: { servicesOnly?: boolean | null; replacementCost?: Numeric<14, 2> | null } = {};
    if (input.servicesOnly !== undefined) {
      schemeData.servicesOnly = input.servicesOnly;
      change.servicesOnly = true;
    }
    if (input.replacementCost !== undefined) {
      schemeData.replacementCost = input.replacementCost == null ? null : (input.replacementCost as unknown as Numeric<14, 2>);
      change.replacementCost = true;
    }
    if (Object.keys(schemeData).length) await tx.orm.public.Scheme.where((s) => s.id.eq(schemeId)).update(schemeData);
    const answers = Object.entries(input.occupiable ?? {});
    if (answers.length) {
      const lots = new Map((await tx.orm.public.Lot.where((l) => l.schemeId.eq(schemeId)).all()).map((l) => [l.id, l]));
      for (const [lotId, occupiable] of answers) {
        const lot = lots.get(lotId);
        if (!lot) throw new BuildingRulesError("A lot in the form is not one of this building's lots. Reload the page and try again.");
        if ((lot.occupiable ?? null) === occupiable) continue;
        await tx.orm.public.Lot.where((l) => and(l.id.eq(lotId), l.schemeId.eq(schemeId))).updateAndCount({ occupiable });
        change.lots += 1;
      }
    }
    return change;
  });
}
