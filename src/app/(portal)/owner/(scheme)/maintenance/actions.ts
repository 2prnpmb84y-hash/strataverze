"use server";

export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

/**
 * Retired 25 Oct 2026 (works marketplace stage 1). Owners and the committee
 * now raise works requests, which go to the committee for its vote
 * (submitWorksRequestAction in src/lib/actions/works-marketplace.ts). This
 * created a maintenance work order with no committee decision, so it now
 * changes nothing and points to the new flow. Earlier work orders stay.
 */
export async function createOwnerWorkOrderAction(
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  return { error: "Report it under Works requests, so the committee can decide how it is handled." };
}
