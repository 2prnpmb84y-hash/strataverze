/**
 * Fixed choices an administrator picks from, instead of typing, when they
 * reset someone's authenticator or sign them out everywhere. Free text is
 * never kept in the security audit log, which cannot be corrected or erased
 * for 7 years (S6 review).
 */

export const IDENTITY_CHECKS = {
  callback_and_email: "Called back on the phone number on record, and confirmed by email to the address on record",
  callback_only: "Called back on the phone number on record",
  in_person: "Met in person and checked photo identification",
  video_call: "Video call, checked against photo identification",
} as const;
export type IdentityCheck = keyof typeof IDENTITY_CHECKS;

export const SIGN_OUT_REASONS = {
  lost_device: "A device was lost or stolen",
  suspected_compromise: "The account may have been used by someone else",
  left_role: "The person has left their role",
  user_request: "The person asked for it",
} as const;
export type SignOutReason = keyof typeof SIGN_OUT_REASONS;

export function isIdentityCheck(value: unknown): value is IdentityCheck {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(IDENTITY_CHECKS, value);
}

export function isSignOutReason(value: unknown): value is SignOutReason {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(SIGN_OUT_REASONS, value);
}
