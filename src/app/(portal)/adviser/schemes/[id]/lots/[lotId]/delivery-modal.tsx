"use client";

import { useState, useTransition, useCallback } from "react";
import { X } from "lucide-react";
import { updateDeliveryPreferenceAction } from "./lot-workflow-actions";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type DeliveryData = {
  deliveryMethod: string;
  recipientType: string;
  recipientName: string;
  recipientEmail: string;
  recipientAddress: string;
  recipientSuburb: string;
  recipientState: string;
  recipientPostcode: string;
};

const emptyDelivery: DeliveryData = {
  deliveryMethod: "EMAIL",
  recipientType: "OWNER",
  recipientName: "",
  recipientEmail: "",
  recipientAddress: "",
  recipientSuburb: "",
  recipientState: "",
  recipientPostcode: "",
};

const deliveryMethods = [
  { value: "EMAIL", label: "Email" },
  { value: "POST", label: "Post" },
  { value: "SMS", label: "SMS" },
] as const;

const recipientTypes = [
  { value: "AGENT", label: "Agent" },
  { value: "OWNER", label: "Owner" },
  { value: "TENANT", label: "Tenant" },
  { value: "OTHER", label: "Other" },
] as const;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function DeliveryModal({
  isOpen,
  onClose,
  schemeId,
  lotId,
  initialNotices,
  initialCorrespondence,
}: {
  isOpen: boolean;
  onClose: () => void;
  schemeId: string;
  lotId: string;
  initialNotices?: DeliveryData;
  initialCorrespondence?: DeliveryData;
}) {
  const [notices, setNotices] = useState<DeliveryData>(
    initialNotices ?? { ...emptyDelivery },
  );
  const [correspondence, setCorrespondence] = useState<DeliveryData>(
    initialCorrespondence ?? { ...emptyDelivery },
  );
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(() => {
    setError(null);
    startTransition(async () => {
      try {
        /* Annual Notices and Meeting Notices share the same values */
        const noticesForm = toFormData(notices);
        const corrForm = toFormData(correspondence);

        const [r1, r2, r3] = await Promise.all([
          updateDeliveryPreferenceAction(schemeId, lotId, "ANNUAL_NOTICES", noticesForm),
          updateDeliveryPreferenceAction(schemeId, lotId, "MEETING_NOTICES", noticesForm),
          updateDeliveryPreferenceAction(schemeId, lotId, "GENERAL_CORRESPONDENCE", corrForm),
        ]);

        const firstError = [r1, r2, r3].find((r) => "error" in r && r.error);
        if (firstError && "error" in firstError) {
          setError(firstError.error ?? "An unexpected error occurred.");
          return;
        }

        setEditing(false);
        onClose();
      } catch {
        setError("Failed to save delivery preferences.");
      }
    });
  }, [notices, correspondence, schemeId, lotId, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-white rounded-[var(--radius-card)] shadow-xl mx-4">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between bg-white px-6 py-4 border-b border-line rounded-t-[var(--radius-card)]">
          <h2 className="text-lg font-heading font-semibold text-ink">
            Delivery Methods
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-full text-ink-muted hover:text-ink hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-8">
          {/* Section 1: Annual Notices / Meeting Notices */}
          <DeliverySection
            title="Annual Notices / Meeting Notices"
            data={notices}
            onChange={setNotices}
            disabled={!editing}
          />

          {/* Divider */}
          <hr className="border-line" />

          {/* Section 2: General Correspondence */}
          <DeliverySection
            title="General Correspondence"
            data={correspondence}
            onChange={setCorrespondence}
            disabled={!editing}
          />

          {/* Error */}
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-end gap-3 bg-white px-6 py-4 border-t border-line rounded-b-[var(--radius-card)]">
          {!editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center justify-center gap-2 rounded-full px-6 h-10 text-[13px] font-semibold uppercase tracking-[0.04em] transition-colors bg-white border-[1.5px] border-turquoise text-turquoise hover:bg-turquoise/5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-turquoise"
            >
              Edit
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setNotices(initialNotices ?? { ...emptyDelivery });
                  setCorrespondence(initialCorrespondence ?? { ...emptyDelivery });
                }}
                disabled={isPending}
                className="inline-flex items-center justify-center gap-2 rounded-full px-6 h-10 text-[13px] font-semibold uppercase tracking-[0.04em] transition-colors text-ink-muted hover:text-ink hover:bg-muted focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-turquoise disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending}
                className="inline-flex items-center justify-center gap-2 rounded-full px-6 h-10 text-[13px] font-semibold uppercase tracking-[0.04em] transition-colors bg-turquoise text-white hover:bg-turquoise/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-turquoise disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Save"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Delivery section (reusable for each category group)                */
/* ------------------------------------------------------------------ */

function DeliverySection({
  title,
  data,
  onChange,
  disabled,
}: {
  title: string;
  data: DeliveryData;
  onChange: (d: DeliveryData) => void;
  disabled: boolean;
}) {
  function update(field: keyof DeliveryData, value: string) {
    onChange({ ...data, [field]: value });
  }

  return (
    <div>
      <h3 className="text-sm font-heading font-semibold text-ink mb-4">
        {title}
      </h3>

      {/* Delivery Method */}
      <div className="mb-4">
        <p className="text-xs font-medium text-ink-muted mb-2">
          Delivery Method
        </p>
        <div className="flex gap-4">
          {deliveryMethods.map((m) => (
            <label
              key={m.value}
              className="flex items-center gap-2 cursor-pointer"
            >
              <input
                type="radio"
                name={`${title}-method`}
                value={m.value}
                checked={data.deliveryMethod === m.value}
                onChange={() => update("deliveryMethod", m.value)}
                disabled={disabled}
                className="h-4 w-4 border-line text-turquoise focus:ring-turquoise"
              />
              <span className="text-sm text-ink">{m.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Recipient Type */}
      <div className="mb-4">
        <p className="text-xs font-medium text-ink-muted mb-2">Recipient</p>
        <div className="flex gap-1">
          {recipientTypes.map((r) => (
            <button
              key={r.value}
              type="button"
              disabled={disabled}
              onClick={() => update("recipientType", r.value)}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                data.recipientType === r.value
                  ? "bg-turquoise text-white"
                  : "bg-muted text-ink-muted hover:text-ink"
              } disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Recipient details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ModalField
          label="Name"
          value={data.recipientName}
          onChange={(v) => update("recipientName", v)}
          disabled={disabled}
        />
        <ModalField
          label="Email"
          value={data.recipientEmail}
          onChange={(v) => update("recipientEmail", v)}
          disabled={disabled}
          type="email"
        />
        <ModalField
          label="Address"
          value={data.recipientAddress}
          onChange={(v) => update("recipientAddress", v)}
          disabled={disabled}
          className="sm:col-span-2"
        />
        <ModalField
          label="Suburb"
          value={data.recipientSuburb}
          onChange={(v) => update("recipientSuburb", v)}
          disabled={disabled}
        />
        <div className="grid grid-cols-2 gap-4">
          <ModalField
            label="State"
            value={data.recipientState}
            onChange={(v) => update("recipientState", v)}
            disabled={disabled}
          />
          <ModalField
            label="P/Code"
            value={data.recipientPostcode}
            onChange={(v) => update("recipientPostcode", v)}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Small inline field (keeps the modal self-contained)                */
/* ------------------------------------------------------------------ */

function ModalField({
  label,
  value,
  onChange,
  disabled,
  type = "text",
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  type?: "text" | "email";
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-ink-muted mb-1">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-[var(--radius-card)] border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-turquoise focus:border-turquoise transition-colors disabled:bg-muted disabled:cursor-not-allowed"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function toFormData(data: DeliveryData): FormData {
  const fd = new FormData();
  fd.set("deliveryMethod", data.deliveryMethod);
  fd.set("recipientType", data.recipientType);
  fd.set("recipientName", data.recipientName);
  fd.set("recipientEmail", data.recipientEmail);
  fd.set("recipientAddress", data.recipientAddress);
  fd.set("recipientSuburb", data.recipientSuburb);
  fd.set("recipientState", data.recipientState);
  fd.set("recipientPostcode", data.recipientPostcode);
  return fd;
}
