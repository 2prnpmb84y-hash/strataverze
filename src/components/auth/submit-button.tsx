"use client";

import { useFormStatus } from "react-dom";
import { PRIMARY_ACTION_CLASS } from "@/components/ui/action-styles";

/**
 * The main submit button of a sign-in form. While the form is being sent it
 * is disabled, says so (pendingLabel) and carries aria-busy, which keeps
 * the brand colours (see action-styles.ts).
 */
export function SubmitButton({
  children,
  pendingLabel,
  formAction,
  disabled = false,
  className = "",
}: {
  children: React.ReactNode;
  pendingLabel: string;
  formAction?: (formData: FormData) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      formAction={formAction}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={`w-full ${PRIMARY_ACTION_CLASS} ${className}`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
