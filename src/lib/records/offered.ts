/**
 * Whether a building's pack offers the certificate and records access
 * workflows (pure, VIC, ACT and WA stage 2, PR 10a, 31 Oct 2026). Every page,
 * route, action and store step that gates on them asks here, so the gate is
 * one rule.
 *
 * For NSW and Queensland these give exactly what the inline checks gave
 * before (offered.test.ts compares them for every combination): the NSW s 184
 * certificate or the Queensland body corporate certificate, and NSW s 182 or
 * Queensland s 205 inspections. The draft packs' own switches
 * (certificateKinds, recordsAccess) are set by no pack until the pack PRs that
 * wire them (10b to 10d). Imports no pack.
 *
 * The pages, the PDF route and the store steps that read rules.CERTIFICATE or
 * rules.INSPECTIONS (the NSW and Queensland shapes) ask the narrower
 * certificateRulesOffered and inspectionRulesOffered, so a pack with only the
 * draft packs' switches is refused there cleanly (not available, or not
 * found) and never reaches needRule. 10b moves each of them to the wider
 * gate as it gains its kinds branch.
 */
import type { StatutoryRules } from "@/config/statutory";

type Features = StatutoryRules["FEATURES"];

/** A certificate of some kind is offered: FEATURES.strataInformationCertificate, bodyCorporateCertificate or certificateKinds. */
export function certificateOffered(features: Pick<Features, "strataInformationCertificate" | "bodyCorporateCertificate" | "certificateKinds">): boolean {
  return features.strataInformationCertificate === true || features.bodyCorporateCertificate === true || features.certificateKinds === true;
}

/** Records access of some kind is offered: FEATURES.recordsInspections or recordsAccess. */
export function accessOffered(features: Pick<Features, "recordsInspections" | "recordsAccess">): boolean {
  return features.recordsInspections === true || features.recordsAccess === true;
}

/** The certificate in the CERTIFICATE shape (NSW s 184, the Queensland body corporate certificate) is offered. */
export function certificateRulesOffered(features: Pick<Features, "strataInformationCertificate" | "bodyCorporateCertificate">): boolean {
  return features.strataInformationCertificate === true || features.bodyCorporateCertificate === true;
}

/** Inspections in the INSPECTIONS shape (NSW s 182, Queensland s 205) are offered. */
export function inspectionRulesOffered(features: Pick<Features, "recordsInspections">): boolean {
  return features.recordsInspections === true;
}
