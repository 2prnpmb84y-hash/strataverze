"use client";

import { useActionState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormField, SelectField, TextareaField } from "@/components/ui/form-field";
import { UnsavedGuard } from "@/components/ui/unsaved-guard";
import { saveDeclarationAction, type RenewalFormState } from "../actions";

const yesNo = [
  { value: "", label: "—" },
  { value: "YES", label: "Yes" },
  { value: "NO", label: "No" },
];
const sprinklerOptions = [
  { value: "", label: "—" },
  { value: "FULLY", label: "Fully" },
  { value: "BASEMENT", label: "Basement only" },
  { value: "EXTERNAL", label: "External wall" },
  { value: "NONE", label: "None" },
];

const WALLS: [string, string][] = [
  ["doubleBrick", "Double Brick"],
  ["brick", "Brick"],
  ["brickVeneer", "Brick Veneer"],
  ["timberWeatherboard", "Timber / Weatherboard"],
  ["steel", "Steel"],
  ["concreteHebel", "Concrete / Hebel"],
  ["fibroAsbestos", "Fibro / Asbestos Cement"],
  ["stoneSandstone", "Stone / Sandstone"],
  ["polystyrene", "Polystyrene"],
  ["mudBrick", "Mud Brick"],
];
const FLOOR: [string, string][] = [
  ["concreteSlab", "Concrete Slab"],
  ["concrete", "Concrete"],
  ["timber", "Timber"],
];
const ROOF: [string, string][] = [
  ["concrete", "Concrete"],
  ["tiles", "Tiles"],
  ["fibro", "Fibro"],
  ["metal", "Metal"],
  ["iron", "Iron"],
  ["colorbond", "Colorbond"],
  ["slate", "Slate"],
  ["copper", "Copper"],
  ["tin", "Tin"],
  ["shingle", "Shingle"],
  ["thatched", "Thatched"],
];

const POLICY_LIMITS: [string, string][] = [
  ["building", "Building"],
  ["contents", "Common contents"],
  ["lossOfRent", "Loss of rent"],
  ["catastrophe", "Catastrophe"],
  ["publicLiability", "Public liability"],
  ["officeBearers", "Office bearers"],
  ["fidelityGuarantee", "Fidelity guarantee"],
  ["voluntaryWorkers", "Voluntary workers"],
  ["excess", "Standard excess"],
];

const QUESTIONS: [string, string][] = [
  ["q_rewired", "Has the building been rewired or replumbed in the last 20 years?"],
  ["q_hazards", "Are there any known hazards and/or defects associated with the property?"],
  ["q_council_orders", "Are there any unresolved Council Orders?"],
  ["q_ncat", "Are there any outstanding NCAT or legal proceedings?"],
  ["q_office_bearers", "Any circumstances which could lead to an Office Bearers claim?"],
  ["q_commercial_change", "Change in commercial occupants in the past 12 months?"],
  ["q_asbestos_eps", "Additional information insurers should be aware of (remedial works, asbestos, EPS)?"],
  ["q_declined", "Has the insurance on this risk ever been declined or had special terms imposed?"],
];

const inputClass =
  "w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise";

function Check({
  name,
  label,
  checked,
}: {
  name: string;
  label: string;
  checked: boolean;
}) {
  return (
    <label className="flex items-center gap-1.5 text-sm text-ink">
      <input type="checkbox" name={name} value="YES" defaultChecked={checked} />
      {label}
    </label>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mt-5 mb-2">
      {children}
    </h4>
  );
}

export function RenewalDeclaration({
  schemeId,
  renewalId,
  declaration,
}: {
  schemeId: string;
  renewalId: string;
  declaration: Record<string, string>;
}) {
  const [state, action, pending] = useActionState<RenewalFormState, FormData>(
    saveDeclarationAction.bind(null, schemeId, renewalId),
    {},
  );
  const d = (k: string) => declaration[k] ?? "";
  const checked = (k: string) => declaration[k] === "YES";
  const dollar = (k: string) => declaration[k] ?? "";

  return (
    <Card>
      <CardHeader
        title="Pre-renewal declaration"
        description="Strata insurance pre-renewal declaration. Saved as a snapshot against this renewal."
      />
      <form action={action} className="space-y-4">
        <UnsavedGuard />
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}

        {/* 1. Insured details */}
        <SubHeading>1. Insured details</SubHeading>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Name of insured" name="nameOfInsured" defaultValue={d("nameOfInsured")} />
          <FormField label="Name of building" name="nameOfBuilding" defaultValue={d("nameOfBuilding")} />
          <FormField label="Address" name="address" defaultValue={d("address")} className="sm:col-span-2" />
        </div>

        {/* 2. Property details */}
        <SubHeading>2. Property details</SubHeading>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <FormField label="No. of units" name="units" type="number" defaultValue={d("units")} />
          <FormField label="Year built" name="yearBuilt" type="number" defaultValue={d("yearBuilt")} />
          <FormField label="No. of storeys" name="storeys" type="number" defaultValue={d("storeys")} />
          <FormField label="No. of lifts" name="lifts" type="number" defaultValue={d("lifts")} />
          <FormField label="Residential units" name="residentialUnits" type="number" defaultValue={d("residentialUnits")} />
          <FormField label="Commercial units" name="commercialUnits" type="number" defaultValue={d("commercialUnits")} />
          <FormField label="Car lift / stacker" name="carLiftStacker" type="number" defaultValue={d("carLiftStacker")} />
          <FormField label="No. of basements" name="basements" type="number" defaultValue={d("basements")} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SelectField label="Heritage listed" name="heritageListed" defaultValue={d("heritageListed")} options={yesNo} />
        </div>
        <TextareaField
          label="If commercial units, occupation of tenants"
          name="commercialOccupation"
          rows={2}
          defaultValue={d("commercialOccupation")}
        />

        {/* 3. Construction */}
        <SubHeading>3. Construction details</SubHeading>
        <div>
          <p className="text-sm font-medium text-ink mb-1.5">Walls</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {WALLS.map(([k, label]) => (
              <Check key={k} name={`wall_${k}`} label={label} checked={checked(`wall_${k}`)} />
            ))}
          </div>
          <input className={`${inputClass} mt-2`} name="wall_other" placeholder="Others (please specify)" defaultValue={d("wall_other")} />
        </div>
        <div>
          <p className="text-sm font-medium text-ink mb-1.5">Floor</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {FLOOR.map(([k, label]) => (
              <Check key={k} name={`floor_${k}`} label={label} checked={checked(`floor_${k}`)} />
            ))}
          </div>
          <input className={`${inputClass} mt-2`} name="floor_other" placeholder="Others (please specify)" defaultValue={d("floor_other")} />
        </div>
        <div>
          <p className="text-sm font-medium text-ink mb-1.5">Roof</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {ROOF.map(([k, label]) => (
              <Check key={k} name={`roof_${k}`} label={label} checked={checked(`roof_${k}`)} />
            ))}
          </div>
          <input className={`${inputClass} mt-2`} name="roof_other" placeholder="Others (please specify)" defaultValue={d("roof_other")} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
          <SelectField label="EPS / aluminium composite panelling" name="eps" defaultValue={d("eps")} options={yesNo} />
          <FormField label="If yes, exact type, brand and name of cladding" name="epsType" defaultValue={d("epsType")} />
          <FormField label="Where located and % of facade" name="epsLocation" defaultValue={d("epsLocation")} className="sm:col-span-2" />
        </div>

        {/* 4. Amenities */}
        <SubHeading>4. Amenities</SubHeading>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <FormField label="Tennis courts" name="tennisCourts" type="number" defaultValue={d("tennisCourts")} />
          <FormField label="Playgrounds" name="playgrounds" type="number" defaultValue={d("playgrounds")} />
          <FormField label="Pools / spas" name="poolsSpas" type="number" defaultValue={d("poolsSpas")} />
          <FormField label="Gyms" name="gyms" type="number" defaultValue={d("gyms")} />
          <FormField label="Jetties / wharfs" name="jettiesWharfs" type="number" defaultValue={d("jettiesWharfs")} />
          <FormField label="Other water features" name="otherWaterFeatures" defaultValue={d("otherWaterFeatures")} />
        </div>

        {/* 5. Fire protection */}
        <SubHeading>5. Fire protection</SubHeading>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SelectField label="Sprinkler system" name="sprinkler" defaultValue={d("sprinkler")} options={sprinklerOptions} />
          <SelectField label="Smoke detectors" name="smokeDetectors" defaultValue={d("smokeDetectors")} options={yesNo} />
          <SelectField label="Hose reel" name="hoseReel" defaultValue={d("hoseReel")} options={yesNo} />
          <SelectField label="Hydrant" name="hydrant" defaultValue={d("hydrant")} options={yesNo} />
        </div>

        {/* 6. Policy limits */}
        <SubHeading>6. Policy limits</SubHeading>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          {POLICY_LIMITS.map(([k, label]) => (
            <div key={k} className="flex items-center justify-between gap-3">
              <span className="text-sm text-ink">{label}</span>
              <input
                className="w-40 rounded-[var(--radius-card)] border border-line bg-white px-3 py-1.5 text-sm text-right tabular-nums"
                type="number"
                name={`limit_${k}`}
                placeholder="$"
                defaultValue={dollar(`limit_${k}`)}
              />
            </div>
          ))}
        </div>
        <TextareaField label="Details of any additional excess" name="additionalExcessDetails" rows={2} defaultValue={d("additionalExcessDetails")} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SelectField label="Flood cover?" name="coverFlood" defaultValue={d("coverFlood")} options={yesNo} />
          <SelectField label="Machinery breakdown?" name="coverMachinery" defaultValue={d("coverMachinery")} options={yesNo} />
          <SelectField label="Floating floors?" name="coverFloatingFloors" defaultValue={d("coverFloatingFloors")} options={yesNo} />
        </div>

        {/* 7. Declaration questions */}
        <SubHeading>Declaration</SubHeading>
        <div className="space-y-2">
          {QUESTIONS.map(([k, label]) => (
            <div key={k} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
              <span className="sm:col-span-6 text-sm text-ink">{label}</span>
              <div className="sm:col-span-2">
                <select className={inputClass} name={k} defaultValue={d(k)}>
                  {yesNo.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <input
                className={`sm:col-span-4 ${inputClass}`}
                name={`${k}_comment`}
                placeholder="If yes, please comment"
                defaultValue={d(`${k}_comment`)}
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Saving..." : "Save declaration"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
