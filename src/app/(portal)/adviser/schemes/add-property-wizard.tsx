"use client";

import { useState, useActionState, useMemo, useRef, useEffect, startTransition } from "react";
import { useRouter } from "next/navigation";
import { PropertyPhotoField } from "./property-photo-field";
import { uploadSchemePhoto } from "@/lib/schemes/upload-photo";
import { Button } from "@/components/ui/button";
import {
  FormField,
  SelectField,
  CheckboxField,
} from "@/components/ui/form-field";
import { Card } from "@/components/ui/card";
import { createSchemeAction, type OnboardingStep, type SchemeFormState } from "./actions";
import { StrataRollUpload } from "./strata-roll-upload";
import type { ParsedStrataRoll, RollIssue } from "@/lib/parse-strata-roll";
import {
  auDate,
  blankLotBalance,
  blankLots,
  checkLotBalances,
  checkLots,
  checkOpeningBalances,
  checkYearEnd,
  currentYearEnd,
  emptyOpeningBalances,
  formatMoney,
  type LotBalanceInput,
  type OnboardingLot,
  type OpeningBalancesInput,
} from "@/lib/onboarding/property-onboarding";
import { BalancesStep, LotBalancesStep, LotsStep, RollNotes, StepProblems } from "./onboarding-steps";
import { SCHEME_STATE_HELP, SCHEME_STATE_OPTIONS, schemeLocationProblems, schemeStateProblem } from "@/config/jurisdictions";
import { planNumberLabel, type OnboardingWords } from "@/lib/onboarding/onboarding-words";
import { bodyCorporateName, capitalise } from "@/lib/jurisdiction/wording";
import { fundRequirementsView, noLedgerProblem } from "@/lib/jurisdiction/funds";
import { FundRequirements } from "./[id]/_sections/fund-requirements";

const STEPS = [
  { id: "upload", label: "Strata Roll" },
  { id: "details", label: "Property Details" },
  { id: "address", label: "Address & Settings" },
  { id: "lots", label: "Lots & Owners" },
  { id: "balances", label: "Opening Balances" },
  { id: "lotBalances", label: "Lot Balances" },
  { id: "review", label: "Review & Create" },
] as const;

const BUILDING_TYPES = [
  { value: "", label: "Select type..." },
  { value: "STRATA", label: "Strata" },
  { value: "COMMUNITY", label: "Community" },
  { value: "COMPANY_TITLE", label: "Company Title" },
  { value: "STRATUM", label: "Stratum" },
];

const BUILDING_SUB_TYPES = [
  { value: "", label: "Select sub-type..." },
  { value: "Residential", label: "Residential" },
  { value: "Commercial", label: "Commercial" },
  { value: "Mixed Use", label: "Mixed Use" },
  { value: "Industrial", label: "Industrial" },
  { value: "Retail", label: "Retail" },
];

const BUILDING_CLASSES = [
  { value: "", label: "Select class..." },
  { value: "1", label: "Class 1 — Detached houses" },
  { value: "2", label: "Class 2 — Apartments / units" },
  { value: "3", label: "Class 3 — Residential (other)" },
  { value: "5", label: "Class 5 — Office" },
  { value: "6", label: "Class 6 — Retail / shops" },
  { value: "7", label: "Class 7 — Storage / car parks" },
  { value: "8", label: "Class 8 — Laboratory / production" },
  { value: "9", label: "Class 9 — Public building" },
];

const PAYMENT_PLANS = [
  { value: "", label: "Select plan..." },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "ANNUALLY", label: "Annually" },
  { value: "HALF_YEARLY", label: "Half-Yearly" },
];

type StepId = (typeof STEPS)[number]["id"];

type Defaults = {
  name?: string;
  planNumber?: string;
  address?: string;
  suburb?: string;
  state?: string;
  postcode?: string;
  abnNumber?: string;
  totalLots?: string;
  totalEntitlement?: string;
  financialYearEnd?: string;
  buildingType?: string;
};

type ReviewValues = Record<string, string> & { isActive: string; allInclusiveFees: string; debtCollection: string };

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/** The legal name, where the pack's name for the body corporate includes the building's name; else null. */
function legalName(w: Pick<OnboardingWords, "bodyCorporateName" | "ownersCorporation">, name: string, planNumber: string): string | null {
  return w.bodyCorporateName.includes("{name}") && name.trim() && planNumber.trim() ? bodyCorporateName(w, { name: name.trim(), planNumber: planNumber.trim() }) : null;
}

const wholeNumber = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return /^\d+$/.test(s) ? Number(s) : NaN;
};

/**
 * `today` (YYYY-MM-DD, Sydney) comes from the server page, so the year-end
 * and takeover date checks use the same date there and here.
 *
 * `wordsByState` holds the words for each state a building can be set up in,
 * from that state's rule pack (QLD go-live, 27 Oct 2026). The wizard uses the
 * set for the state chosen: its entitlement, funds, levy and late charge
 * words, its plan and body corporate names, and, where the pack has them, the
 * regulation module and each lot's second entitlement. Where more than one
 * state can be chosen, the state is asked first, on Property Details.
 */
export function AddPropertyWizard({
  simplified = false,
  today,
  wordsByState,
  defaultState,
}: {
  simplified?: boolean;
  today: string;
  wordsByState: Readonly<Record<string, OnboardingWords>>;
  defaultState: string;
}) {
  const [currentStep, setCurrentStep] = useState<StepId>("upload");
  const [defaults, setDefaults] = useState<Defaults>({});
  // The state chosen, which decides the words (and what is asked).
  const [stateCode, setStateCode] = useState(defaultState);
  const words = wordsByState[stateCode] ?? wordsByState[defaultState];
  const multiState = Object.keys(wordsByState).length > 1;
  const [fromRoll, setFromRoll] = useState(false);
  // What the roll reader flagged, and where each lot was read from (24 Oct).
  const [rollIssues, setRollIssues] = useState<RollIssue[]>([]);
  const [formKey, setFormKey] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  // Steps checked on the way forward; their problems are shown once tried.
  const [tried, setTried] = useState<Partial<Record<StepId, boolean>>>({});
  const [clientProblems, setClientProblems] = useState<string[]>([]);

  // Read from the details and address steps when moving on from them.
  const [totals, setTotals] = useState({ totalLots: NaN, totalEntitlement: NaN });
  const [yearEnd, setYearEnd] = useState("");

  const [lots, setLots] = useState<OnboardingLot[]>([]);
  const [balances, setBalances] = useState<OpeningBalancesInput>(() => emptyOpeningBalances());
  const [lotBalances, setLotBalances] = useState<LotBalanceInput[]>([]);
  const [review, setReview] = useState<ReviewValues | null>(null);

  const [state, formAction, isPending] = useActionState<SchemeFormState, FormData>(createSchemeAction, {});
  const router = useRouter();
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoStatus, setPhotoStatus] = useState<string | null>(null);

  // The building exists: upload the chosen photo, then carry on. If the photo
  // fails, the building still stands and its page says the photo can be added.
  useEffect(() => {
    const created = state.created;
    if (!created || !photo) return;
    let cancelled = false;
    uploadSchemePhoto(created.schemeId, photo).then((r) => {
      if (cancelled) return;
      if ("error" in r) {
        router.push(`/adviser/schemes/${created.schemeId}?photo=not-saved&next=${encodeURIComponent(created.destination)}`);
      } else {
        router.push(created.destination);
      }
    });
    startTransition(() => setPhotoStatus("Building created. Uploading the photo…"));
    return () => {
      cancelled = true;
    };
  }, [state.created, photo, router]);

  // A problem found by the server sends the wizard back to its step.
  const [seenState, setSeenState] = useState(state);
  const [serverDismissed, setServerDismissed] = useState(false);
  if (state !== seenState) {
    setSeenState(state);
    setServerDismissed(false);
    if (state.step) {
      setCurrentStep(state.step);
      setTried((t) => ({ ...t, [state.step as OnboardingStep]: true }));
    }
  }

  const lotsCheck = useMemo(() => checkLots(lots, totals.totalLots, totals.totalEntitlement, words), [lots, totals, words]);
  const balancesCheck = useMemo(() => checkOpeningBalances(balances, yearEnd || null, today, words), [balances, yearEnd, today, words]);
  const lotBalancesCheck = useMemo(() => checkLotBalances(lotBalances, lotsCheck.lots, balancesCheck, words), [lotBalances, lotsCheck.lots, balancesCheck, words]);
  const ownerNames = useMemo(() => Object.fromEntries(lotsCheck.lots.map((l) => [l.lotNumber, l.ownerName ?? ""])), [lotsCheck.lots]);

  const currentIndex = STEPS.findIndex((s) => s.id === currentStep);

  function readForm(): FormData | null {
    return formRef.current ? new FormData(formRef.current) : null;
  }

  /** Check the step being left. Returns the problems (none means go on). */
  function problemsLeaving(step: StepId): string[] {
    const fd = readForm();
    switch (step) {
      case "details": {
        if (!fd) return [];
        const p: string[] = [];
        if (!String(fd.get("name") ?? "").trim()) p.push("Enter the scheme name.");
        if (!String(fd.get("planNumber") ?? "").trim()) p.push("Enter the plan number.");
        const tl = wholeNumber(fd.get("totalLots"));
        const te = wholeNumber(fd.get("totalEntitlement"));
        if (!(tl >= 1)) p.push("Enter the total number of lots (a whole number).");
        if (!(te >= 1)) p.push(`Enter the total ${words.entitlement} (a whole number).`);
        setTotals({ totalLots: tl, totalEntitlement: te });
        return p;
      }
      case "address": {
        if (!fd) return [];
        const p: string[] = [];
        if (!String(fd.get("address") ?? "").trim()) p.push("Enter the street address.");
        if (!String(fd.get("suburb") ?? "").trim()) p.push("Enter the suburb.");
        if (!/^\d{4}$/.test(String(fd.get("postcode") ?? "").trim())) p.push("Enter a 4-digit postcode.");
        // Only NSW buildings, with an NSW postcode (the server checks the same).
        const loc = schemeLocationProblems({ state: String(fd.get("state") ?? ""), postcode: String(fd.get("postcode") ?? "") });
        if (loc.state) p.push(loc.state);
        if (loc.postcode) p.push(loc.postcode);
        const ye = checkYearEnd(String(fd.get("financialYearEnd") ?? ""), today);
        if (!ye.ok) p.push(ye.message);
        // The module, where the pack has one: only a module StrataVerze applies can be chosen (the server checks the same).
        const choices = words.regulationModule;
        if (choices && !choices.options.some((o) => o.supported && o.value === String(fd.get("regulationModule") ?? ""))) {
          p.push(`Choose the ${choices.label.toLowerCase()}.`);
        }
        // The plan format, where the pack has one: any listed format (the server checks the same).
        const formats = words.planFormat;
        if (formats && !formats.options.some((o) => o.value === String(fd.get("planFormat") ?? ""))) {
          p.push(`Choose the ${formats.label.toLowerCase()}.`);
        }
        setYearEnd(ye.ok ? ye.date : "");
        return p;
      }
      case "lots":
        return lotsCheck.ok ? [] : ["Fix the lots below before going on."];
      case "balances":
        return balancesCheck.ok ? [] : ["Fix the opening balances below before going on."];
      case "lotBalances":
        return lotBalancesCheck.ok ? [] : ["Fix the lot balances below before going on."];
      default:
        return [];
    }
  }

  function enter(step: StepId) {
    if (step === "lots" && lots.length === 0 && totals.totalLots >= 1) setLots(blankLots(totals.totalLots));
    if (step === "lotBalances") {
      // One row per lot, keeping anything already typed for a lot.
      setLotBalances((prev) => lotsCheck.lots.map((l) => prev.find((p) => p.lotNumber === l.lotNumber) ?? blankLotBalance(l.lotNumber)));
    }
    if (step === "review") {
      const fd = readForm();
      if (fd) {
        const v: Record<string, string> = {};
        for (const [k, val] of fd.entries()) if (typeof val === "string" && !k.endsWith("Json")) v[k] = val;
        setReview({ ...v, isActive: String(fd.get("isActive") !== "false"), allInclusiveFees: String(fd.get("allInclusiveFees") === "true"), debtCollection: String(fd.get("debtCollection") === "true") } as ReviewValues);
      }
    }
    setClientProblems([]);
    setServerDismissed(true);
    setCurrentStep(step);
  }

  /**
   * Submit only from the Review step, and without React's automatic form
   * reset: a <form action> is reset after every submit, even one the server
   * refuses, which would put the typed fields back to their defaults while
   * the wizard still showed the typed values (review of 24 Oct).
   */
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (currentStep !== "review" || isPending) return;
    const fd = new FormData(e.currentTarget);
    startTransition(() => formAction(fd));
  }

  function handleNext() {
    const problems = problemsLeaving(currentStep);
    setTried((t) => ({ ...t, [currentStep]: true }));
    if (problems.length) {
      setClientProblems(problems);
      return;
    }
    const next = STEPS[currentIndex + 1];
    if (next) enter(next.id);
  }

  function handleBack() {
    const prev = STEPS[currentIndex - 1];
    if (prev) enter(prev.id);
  }

  function handleParsed(data: ParsedStrataRoll) {
    const s = data.scheme;
    setStateCode(s.state && wordsByState[s.state.trim().toUpperCase()] ? s.state.trim().toUpperCase() : defaultState);
    setDefaults({
      name: s.name ?? undefined,
      planNumber: s.planNumber ?? undefined,
      address: s.address ?? undefined,
      suburb: s.suburb ?? undefined,
      state: s.state ?? undefined,
      postcode: s.postcode ?? undefined,
      abnNumber: s.abnNumber ?? undefined,
      totalLots: s.totalLots != null ? String(s.totalLots) : undefined,
      totalEntitlement: s.totalEntitlement != null ? String(s.totalEntitlement) : undefined,
      financialYearEnd: s.financialYearEnd ?? undefined,
      buildingType: s.buildingType ?? undefined,
    });
    // Each row keeps where it was read from, so the note stays with the row
    // even if its lot number is corrected. A missing entitlement stays blank.
    setLots(
      data.lots.map((l, i) => {
        const d = data.details?.at(i);
        return {
          lotNumber: l.lotNumber,
          unitNumber: l.unitNumber ?? "",
          entitlement: l.entitlement ? String(l.entitlement) : "",
          ownerName: l.ownerName ?? "",
          source: d ? [d.tablePage ? `Roll page ${d.tablePage}` : null, d.ownerPage ? `owner on page ${d.ownerPage}` : null].filter(Boolean).join("; ") : undefined,
        };
      }),
    );
    setFromRoll(data.lots.length > 0);
    setRollIssues(data.issues ?? []);
    setFormKey((k) => k + 1);
    setClientProblems([]);
    setCurrentStep("details");
  }

  // Skipping (even after an upload) starts from a blank building.
  function handleSkip() {
    setStateCode(defaultState);
    setDefaults({});
    setLots([]);
    setFromRoll(false);
    setRollIssues([]);
    setFormKey((k) => k + 1);
    setCurrentStep("details");
  }

  // The state field. It decides the rule pack, so where more than one state
  // can be chosen it is asked first, on Property Details.
  const stateField = (
    <SelectField
      label="State"
      name="state"
      required
      defaultValue={defaults.state || defaultState}
      options={SCHEME_STATE_OPTIONS}
      helpText={SCHEME_STATE_HELP}
      error={state.fieldErrors?.state ?? (defaults.state ? (schemeStateProblem(defaults.state) ?? undefined) : undefined)}
      onChange={(e) => setStateCode(e.target.value)}
    />
  );

  const serverProblems = !serverDismissed && state.step === currentStep && state.stepErrors ? state.stepErrors : [];
  const problems = clientProblems.length ? clientProblems : serverProblems;

  const nav = (nextLabel?: string, submit = false) => (
    <div className="flex items-center justify-between mt-8 pt-6 border-t border-line">
      <Button type="button" variant="secondary" onClick={handleBack}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back
      </Button>
      {submit ? (
        // Only on the Review step, so pressing Enter on another step never submits.
        currentStep === "review" && <Button type="submit" disabled={isPending}>
          {isPending ? "Creating..." : "Create Property"}
        </Button>
      ) : (
        <Button type="button" onClick={handleNext}>
          {nextLabel}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Button>
      )}
    </div>
  );

  return (
    <div>
      {/* Step indicator: earlier steps can be revisited; later ones are reached with Next. */}
      <nav className="mb-8" aria-label="Add property steps">
        <ol className="flex items-center gap-2">
          {STEPS.map((step, i) => {
            const isActive = step.id === currentStep;
            const isComplete = i < currentIndex;
            return (
              <li key={step.id} className="flex items-center gap-2 flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => isComplete && enter(step.id)}
                  disabled={!isComplete && !isActive}
                  aria-current={isActive ? "step" : undefined}
                  className={`flex items-center gap-2 text-sm font-medium transition-colors min-w-0 ${
                    isActive ? "text-turquoise" : isComplete ? "text-ink" : "text-ink-muted"
                  }`}
                >
                  <span
                    className={`flex shrink-0 items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors ${
                      isActive ? "bg-turquoise text-white" : isComplete ? "bg-mint-soft text-turquoise" : "bg-muted text-ink-muted"
                    }`}
                  >
                    {isComplete ? (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                        <path d="M3 7l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span className={`truncate ${isActive ? "hidden md:inline" : "hidden lg:inline"}`}>{step.label}</span>
                </button>
                {i < STEPS.length - 1 && <div className={`flex-1 h-px min-w-2 ${isComplete ? "bg-turquoise/60" : "bg-line"}`} />}
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-sm font-medium text-ink md:hidden">
          Step {currentIndex + 1} of {STEPS.length}: {STEPS[currentIndex].label}
        </p>
      </nav>

      {/* Step 1: Upload Strata Roll (outside the form since it has its own upload logic) */}
      <div className={currentStep === "upload" ? "" : "hidden"}>
        <StrataRollUpload onParsed={handleParsed} onSkip={handleSkip} />
      </div>

      {/* The form wraps the later steps so every field is submitted together. */}
      <form key={formKey} ref={formRef} onSubmit={handleSubmit} noValidate>
        <input type="hidden" name="lotsJson" value={JSON.stringify(lots)} />
        <input type="hidden" name="balancesJson" value={JSON.stringify(balances)} />
        <input type="hidden" name="lotBalancesJson" value={JSON.stringify(lotBalances)} />

        {state.error && currentStep !== "upload" && (
          <div role="alert" className="mb-6 rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {state.error}
          </div>
        )}

        {/* Step 2: Property Details */}
        <div className={currentStep === "details" ? "" : "hidden"}>
          <Card>
            <h2 className="font-heading font-semibold text-ink mb-1">Property Details</h2>
            <p className="text-sm text-ink-muted mb-6">
              Enter the core details of the {titleCase(words.ownersCorporation)}.
              {fromRoll && (
                <span className="block mt-1 text-turquoise font-medium">Fields have been pre-filled from the strata roll ({lots.length} lots read).</span>
              )}
            </p>
            {currentStep === "details" && <StepProblems problems={problems} />}
            <RollNotes issues={rollIssues.filter((i) => !i.lotNumber && i.field !== "financialYearEnd")} title="From the strata roll: check these" />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5">
              {multiState && <div className="sm:col-span-2">{stateField}</div>}
              <FormField
                label="Scheme Name"
                name="name"
                required
                placeholder="e.g. Harbour View Towers OC"
                defaultValue={defaults.name}
                error={state.fieldErrors?.name}
                className="sm:col-span-2"
              />
              <FormField
                label={planNumberLabel(words)}
                name="planNumber"
                required
                placeholder={planNumberLabel(words) === "Plan Number" ? "e.g. SP 12345" : "e.g. 12345"}
                defaultValue={defaults.planNumber}
                error={state.fieldErrors?.planNumber}
              />
              <FormField label="Folio" name="folio" placeholder="e.g. 12345/678" helpText="Land title folio reference" />
              <FormField label="ABN" name="abnNumber" placeholder="e.g. 12 345 678 901" helpText="Optional" defaultValue={defaults.abnNumber} />
              <SelectField label="Building Type" name="buildingType" options={BUILDING_TYPES} defaultValue={defaults.buildingType} />
              <SelectField label="Building Sub-Type" name="buildingSubType" options={BUILDING_SUB_TYPES} />
              <SelectField label="Building Class" name="buildingClass" options={BUILDING_CLASSES} />
              <FormField
                label="Total Lots"
                name="totalLots"
                type="number"
                required
                placeholder="e.g. 24"
                helpText="The lots on the strata plan. The Lots step must have this many."
                defaultValue={defaults.totalLots}
                error={state.fieldErrors?.totalLots}
              />
              <FormField
                label={`Total ${words.entitlementLabel}`}
                name="totalEntitlement"
                type="number"
                required
                placeholder="e.g. 1000"
                helpText={`The aggregate ${words.entitlement}. The lots' ${words.entitlement}s must add up to it.`}
                defaultValue={defaults.totalEntitlement}
                error={state.fieldErrors?.totalEntitlement}
              />
            </div>
            {nav("Next: Address & Settings")}
          </Card>
        </div>

        {/* Step 3: Address & Settings */}
        <div className={currentStep === "address" ? "" : "hidden"}>
          <Card>
            <h2 className="font-heading font-semibold text-ink mb-1">Address &amp; Settings</h2>
            <p className="text-sm text-ink-muted mb-6">Set the property address, financial settings, and preferences.</p>
            {currentStep === "address" && <StepProblems problems={problems} />}
            <RollNotes issues={rollIssues.filter((i) => i.field === "financialYearEnd")} title="From the strata roll" />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5">
              <FormField
                label="Street Address"
                name="address"
                required
                placeholder="e.g. 42 Macquarie Street"
                defaultValue={defaults.address}
                error={state.fieldErrors?.address}
                className="sm:col-span-2"
              />
              <FormField label="Suburb" name="suburb" required placeholder="e.g. Sydney" defaultValue={defaults.suburb} error={state.fieldErrors?.suburb} />
              <div className="grid grid-cols-2 gap-4">
                {!multiState && stateField}
                <FormField label="Postcode" name="postcode" required placeholder="2000" defaultValue={defaults.postcode} error={state.fieldErrors?.postcode} />
              </div>
              <FormField
                label="Financial Year End"
                name="financialYearEnd"
                type="date"
                required
                defaultValue={currentYearEnd(defaults.financialYearEnd ?? "06-30", today)}
                helpText="The last day of the building's current financial year (day, month and year)."
                error={state.fieldErrors?.financialYearEnd}
              />
              <SelectField label="Payment Plan" name="paymentPlan" options={PAYMENT_PLANS} defaultValue="" />
              {words.regulationModule && (
                <ModuleField key={stateCode} choices={words.regulationModule} error={state.fieldErrors?.regulationModule} />
              )}
              {words.planFormat && <PlanFormatField key={`format-${stateCode}`} choices={words.planFormat} error={state.fieldErrors?.planFormat} />}
            </div>

            {!simplified && (
              <div className="mt-6 pt-6 border-t border-line">
                <h3 className="text-sm font-semibold text-ink mb-4">Settings</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <CheckboxField label="Active" name="isActive" defaultChecked={true} helpText="Property is currently active" />
                  <CheckboxField label="All Inclusive Fees" name="allInclusiveFees" helpText={`Include all fees in ${words.levy} calculations`} />
                  <CheckboxField label="Debt Collection" name="debtCollection" helpText="Enable automatic debt collection" />
                </div>
              </div>
            )}
            <PropertyPhotoField value={photo} onChange={setPhoto} />
            {photo && <input type="hidden" name="photoPending" value="1" />}
            {nav("Next: Lots & Owners")}
          </Card>
        </div>

        {/* Step 4: Lots & Owners */}
        <div className={currentStep === "lots" ? "" : "hidden"}>
          <Card>
            {currentStep === "lots" && <StepProblems problems={problems} />}
            <LotsStep
              lots={lots}
              onChange={setLots}
              totalLots={totals.totalLots}
              totalEntitlement={totals.totalEntitlement}
              check={lotsCheck}
              showErrors={!!tried.lots}
              fromRoll={fromRoll}
              notes={rollIssues.filter((i) => i.lotNumber)}
              words={words}
            />
            {nav("Next: Opening Balances")}
          </Card>
        </div>

        {/* Step 5: Opening Balances */}
        <div className={currentStep === "balances" ? "" : "hidden"}>
          <Card>
            {currentStep === "balances" && <StepProblems problems={problems} />}
            <BalancesStep value={balances} onChange={setBalances} check={balancesCheck} yearEnd={yearEnd} showErrors={!!tried.balances} words={words} />
            {nav("Next: Lot Balances")}
          </Card>
        </div>

        {/* Step 6: Lot Opening Balances */}
        <div className={currentStep === "lotBalances" ? "" : "hidden"}>
          <Card>
            {currentStep === "lotBalances" && <StepProblems problems={problems} />}
            <LotBalancesStep
              rows={lotBalances}
              ownerNames={ownerNames}
              onChange={setLotBalances}
              check={lotBalancesCheck}
              sheet={balancesCheck}
              showErrors={!!tried.lotBalances}
              words={words}
            />
            {nav("Next: Review")}
          </Card>
        </div>

        {/* Step 7: Review & Create */}
        <div className={currentStep === "review" ? "" : "hidden"}>
          <Card>
            <h2 className="font-heading font-semibold text-ink mb-1">Review &amp; Create</h2>
            <p className="text-sm text-ink-muted mb-6">Check the details below, then create the property.</p>
            {review && (
              <ReviewSummary
                simplified={simplified}
                v={review}
                lots={lotsCheck.lots}
                entitlementSum={lotsCheck.entitlementSum}
                separateSum={lotsCheck.separateSum}
                words={words}
                balances={balancesCheck}
                lotTotals={lotBalancesCheck.totals}
                photoName={photo?.name ?? null}
              />
            )}
            {photoStatus && <p role="status" className="mt-4 text-sm text-ink">{photoStatus}</p>}
            {nav(undefined, true)}
          </Card>
        </div>
      </form>
    </div>
  );
}

/** The module select, where the building's pack has one. A module StrataVerze does not apply is listed but cannot be chosen. */
function ModuleField({ choices, error }: { choices: NonNullable<OnboardingWords["regulationModule"]>; error?: string }) {
  return (
    <div className="sm:col-span-2">
      <label htmlFor="regulationModule" className="block text-sm font-medium text-ink mb-1.5">
        {choices.label}
        <span className="text-red-500 ml-0.5">*</span>
      </label>
      <select
        id="regulationModule"
        name="regulationModule"
        required
        defaultValue=""
        className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors"
      >
        <option value="" disabled>
          Select module...
        </option>
        {choices.options.map((o) => (
          <option key={o.value} value={o.value} disabled={!o.supported}>
            {o.supported ? o.label : `${o.label} (not available yet)`}
          </option>
        ))}
      </select>
      {error ? <p className="mt-1.5 text-xs text-red-600">{error}</p> : <p className="mt-1.5 text-xs text-ink-muted">{choices.help}</p>}
    </div>
  );
}

/**
 * The plan format select, where the building's pack has one. Every listed
 * format can be chosen, as in the building settings. One StrataVerze does not
 * support yet is marked, and its note is shown once it is chosen.
 */
function PlanFormatField({ choices, error }: { choices: NonNullable<OnboardingWords["planFormat"]>; error?: string }) {
  const [chosen, setChosen] = useState("");
  const note = choices.options.find((o) => o.value === chosen && !o.supported)?.note ?? null;
  return (
    <div className="sm:col-span-2">
      <label htmlFor="planFormat" className="block text-sm font-medium text-ink mb-1.5">
        {choices.label}
        <span className="text-red-500 ml-0.5">*</span>
      </label>
      <select
        id="planFormat"
        name="planFormat"
        required
        defaultValue=""
        onChange={(e) => setChosen(e.target.value)}
        className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors"
      >
        <option value="" disabled>
          Select plan format...
        </option>
        {choices.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.supported ? o.label : `${o.label} (not supported yet)`}
          </option>
        ))}
      </select>
      {error ? (
        <p className="mt-1.5 text-xs text-red-600">{error}</p>
      ) : (
        <p className="mt-1.5 text-xs text-ink-muted">{note ?? choices.help}</p>
      )}
    </div>
  );
}

function ReviewSummary({
  simplified,
  v,
  lots,
  entitlementSum,
  separateSum,
  words,
  balances,
  lotTotals,
  photoName,
}: {
  separateSum: number;
  words: OnboardingWords;
  photoName: string | null;
  simplified?: boolean;
  v: ReviewValues;
  lots: ReturnType<typeof checkLots>["lots"];
  entitlementSum: number;
  balances: ReturnType<typeof checkOpeningBalances>;
  lotTotals: ReturnType<typeof checkLotBalances>["totals"];
}) {
  const val = (k: string) => (v[k] ?? "").trim() || "—";
  const funds = `${words.fundWords.admin.shortLabel} / ${words.fundWords.capitalWorks.shortLabel}`;
  const anyBalance =
    balances.total !== 0 ||
    [balances.admin, balances.capitalWorks].some((f) => Object.values(f).some((c) => c !== 0)) ||
    lotTotals.unallocated !== 0;
  const sections: { title: string; rows: [string, string][] }[] = [
    {
      title: "Property Details",
      rows: [
        ["Scheme Name", val("name")],
        [planNumberLabel(words), val("planNumber")],
        ...(legalName(words, v.name ?? "", v.planNumber ?? "") ? ([["Legal Name", legalName(words, v.name ?? "", v.planNumber ?? "")!]] as [string, string][]) : []),
        ["Folio", val("folio")],
        ["ABN", val("abnNumber")],
        ["Building Type", val("buildingType")],
        ["Building Sub-Type", val("buildingSubType")],
        ["Building Class", val("buildingClass")],
        ["Total Lots", val("totalLots")],
        [`Total ${words.entitlementLabel}`, val("totalEntitlement")],
      ],
    },
    {
      title: "Address & Settings",
      rows: [
        ["Address", `${val("address")}, ${val("suburb")} ${val("state")} ${val("postcode")}`],
        ["Financial Year End", v.financialYearEnd ? auDate(v.financialYearEnd) : "—"],
        ["Payment Plan", val("paymentPlan")],
        ...(words.regulationModule
          ? ([[words.regulationModule.label, words.regulationModule.options.find((o) => o.value === v.regulationModule)?.label ?? "—"]] as [string, string][])
          : []),
        ...(words.planFormat
          ? ([[words.planFormat.label, words.planFormat.options.find((o) => o.value === v.planFormat)?.label ?? "—"]] as [string, string][])
          : []),
        ["Property Photo", photoName ?? "None (can be added later)"],
        ...(simplified
          ? []
          : ([
              ["Active", v.isActive === "true" ? "Yes" : "No"],
              ["All Inclusive Fees", v.allInclusiveFees === "true" ? "Yes" : "No"],
              ["Debt Collection", v.debtCollection === "true" ? "Yes" : "No"],
            ] as [string, string][])),
      ],
    },
    {
      title: "Opening Balances",
      rows: [
        ["Takeover Date", balances.takeoverDate ? auDate(balances.takeoverDate) : "—"],
        ["Total", formatMoney(balances.total)],
        [words.fundWords.admin.label, formatMoney(balances.admin.fundBalance)],
        [words.fundWords.capitalWorks.label, formatMoney(balances.capitalWorks.fundBalance)],
        [`Lot ${titleCase(words.levies)} (${funds})`, `${formatMoney(lotTotals.admin)} / ${formatMoney(lotTotals.capitalWorks)}`],
        [`Lot ${capitalise(words.lateCharge)} (${funds})`, `${formatMoney(lotTotals.interestAdmin)} / ${formatMoney(lotTotals.interestCapitalWorks)}`],
        ["Lot Unallocated Credits", formatMoney(lotTotals.unallocated)],
      ],
    },
  ];

  // For a pack with fund conditions (stage 2, PR 3): the funds the building
  // will be given, read against the lots entered, as createScheme reads them.
  // Absent for NSW and Queensland.
  const fundBuilding = { scheme: { totalLots: Number(v.totalLots) || null }, lots: lots.map((l) => ({ lotNumber: l.lotNumber })), recorded: {} };
  const fundRequirements = words.fundRules ? fundRequirementsView(words.fundRules, fundBuilding) : null;
  // A building that would be given no fund has no ledger, and is refused when it is created (createScheme).
  const noLedger = words.fundRules ? noLedgerProblem(words.fundRules, fundBuilding) : null;

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <div key={section.title}>
          <h3 className="text-sm font-semibold text-ink mb-3">{section.title}</h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            {section.rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 py-1.5 border-b border-line/50">
                <dt className="text-sm text-ink-muted">{label}</dt>
                <dd className="text-sm font-medium text-ink text-right tabular-nums">{value || "—"}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}

      {fundRequirements && (
        <div>
          <h3 className="text-sm font-semibold text-ink mb-3">Funds</h3>
          <p className="text-sm text-ink-muted mb-3">
            Each required fund is set up with the building. A fund that cannot be worked out yet is not set up, and the building page says what to record.
          </p>
          {noLedger && (
            <p role="alert" className="mb-3 rounded-[var(--radius-card)] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {noLedger}
            </p>
          )}
          <FundRequirements requirements={fundRequirements} />
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-ink mb-3">
          Lots ({lots.length}, {words.entitlement} {entitlementSum.toLocaleString("en-AU")}
          {words.separate ? `, ${words.separate.name} ${separateSum.toLocaleString("en-AU")}` : ""})
        </h3>
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th scope="col" className="text-left px-3 py-2 font-medium text-ink-muted">Lot</th>
                <th scope="col" className="text-left px-3 py-2 font-medium text-ink-muted">Unit No.</th>
                <th scope="col" className="text-left px-3 py-2 font-medium text-ink-muted">Owner (as on the strata roll)</th>
                <th scope="col" className="text-right px-3 py-2 font-medium text-ink-muted">{words.entitlementLabel}</th>
                {words.separate && <th scope="col" className="text-right px-3 py-2 font-medium text-ink-muted">{words.separate.label}</th>}
              </tr>
            </thead>
            <tbody>
              {lots.slice(0, 10).map((lot) => (
                <tr key={lot.lotNumber} className="border-t border-line/50">
                  <td className="px-3 py-2 text-ink">{lot.lotNumber}</td>
                  <td className="px-3 py-2 text-ink">{lot.unitNumber ?? "—"}</td>
                  <td className="px-3 py-2 text-ink">{lot.ownerName ?? "—"}</td>
                  <td className="px-3 py-2 text-ink text-right tabular-nums">{lot.entitlement}</td>
                  {words.separate && <td className="px-3 py-2 text-ink text-right tabular-nums">{lot.interestScheduleEntitlement ?? "—"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {lots.length > 10 && (
            <div className="px-3 py-2 bg-muted/30 text-xs text-ink-muted border-t border-line/50">
              Showing 10 of {lots.length} lots. All are created with the property.
            </div>
          )}
        </div>
      </div>

      <p className="rounded-[var(--radius-card)] bg-mint-soft/40 border border-line px-4 py-3 text-sm text-ink">
        {anyBalance
          ? `Creating the property also prepares a draft cutover with these opening balances. Next you enter last year's income and expenditure, this year's budget and the ${words.levies}, then the Adviser checks the cutover, signs it off and posts it in Finance. Nothing is posted to the ledger until then.`
          : "No opening balances were entered, so no cutover is prepared."}
      </p>
    </div>
  );
}
