"use client";

import { useFormStatus } from "react-dom";
import { PRIMARY_ACTION_CLASS } from "@/components/ui/action-styles";

/**
 * The main submit button of a sign-in form. While the form is being sent it
 * says so (pendingLabel), carries aria-busy, which keeps the brand colours
 * (see action-styles.ts), and is aria-disabled rather than disabled: a
 * disabled button drops keyboard focus to the page, so a keyboard or
 * screen reader user loses their place. A click (or Enter in a field)
 * while pending is ignored, so the form is not sent twice. A visually
 * hidden live region announces the pending label.
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
    <>
      <button
        type="submit"
        formAction={formAction}
        disabled={disabled}
        aria-disabled={pending || undefined}
        aria-busy={pending || undefined}
        onClick={(event) => {
          if (pending) event.preventDefault();
        }}
        className={`w-full ${PRIMARY_ACTION_CLASS} ${className}`}
      >
        {pending ? pendingLabel : children}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {pending ? pendingLabel : ""}
      </span>
    </>
  );
}
