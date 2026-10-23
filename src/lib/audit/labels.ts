/** Plain-English labels for security audit events (shown in the viewers). */
const LABELS: Record<string, string> = {
  "auth.sign_in": "Sign-in",
  "auth.sign_out": "Sign-out",
  "auth.sign_up": "Account sign-up",
  "auth.password_reset_requested": "Password reset requested",
  "auth.password_changed": "Password changed",
  "mfa.enrol_started": "Authenticator setup started",
  "mfa.enrol": "Authenticator set up",
  "mfa.verify": "Authenticator code check",
  "mfa.factor_removed": "Authenticator removed",
  "mfa.factor_verified": "Authenticator confirmed (database)",
  "mfa.factor_deleted": "Authenticator deleted (database)",
  "mfa.admin_reset": "Authenticator reset by an administrator",
  "mfa.step_up_required": "Fresh code required",
  "session.ended": "Session ended",
  "session.revoked_all": "Signed out everywhere",
  "access.denied": "Access refused",
  "view.strata_roll": "Viewed the strata roll",
  "view.owner_details": "Viewed a lot and its owners",
  "view.member_list": "Viewed the member list",
  "view.activity_log": "Viewed the activity log",
  "view.financial": "Viewed financial records",
  "view.audit_log": "Viewed the security log",
  "export.pdf": "Downloaded a PDF",
  "export.csv": "Exported a CSV",
  "export.statutory_snapshot": "Downloaded the adopted statutory pack",
  "document.download": "Downloaded a document",
  "scheme.created": "Building created",
  "scheme.deleted": "Building deleted",
  "contractor.approved": "Contractor approved",
  "contractor.rejected": "Contractor rejected",
  "contractor.clarification_requested": "Contractor asked for more information",
  "contractor.suspended": "Contractor suspended",
  "contractor.review_item_resolved": "Contractor review item resolved",
  "admin.referral_income_recorded": "Referral income recorded",
  "action.authorised": "Action taken",
};

export function auditActionLabel(action: string): string {
  if (LABELS[action]) return LABELS[action];
  if (action.startsWith("activity.")) {
    const words = action.slice("activity.".length).replace(/_/g, " ");
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
  return action;
}
