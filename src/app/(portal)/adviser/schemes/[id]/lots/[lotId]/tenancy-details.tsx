"use client";

import { useTransition, useState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import {
  FormField,
  TextareaField,
  CheckboxField,
  SelectField,
} from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import {
  updateTenantAction,
  updatePropertyManagerAction,
} from "./lot-workflow-actions";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type TenantData = {
  tenantNumber: number;
  isOwnerOccupier: boolean;
  isFormalTenant: boolean;
  dateReceived: string | null;
  deliveryBy: string;
  salutation: string | null;
  name: string | null;
  contactName: string | null;
  mobile: string | null;
  email: string | null;
  leaseStart: string | null;
  leaseExpiry: string | null;
  notes: string | null;
};

type PropertyManagerData = {
  agentName: string | null;
  company: string | null;
  address: string | null;
  agentEmail: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
};

type TenancyDetailsProps = {
  schemeId: string;
  lotId: string;
  tenants: TenantData[];
  propertyManager: PropertyManagerData | null;
};

/* ------------------------------------------------------------------ */
/*  Delivery method options                                            */
/* ------------------------------------------------------------------ */

const deliveryOptions = [
  { value: "EMAIL", label: "Email" },
  { value: "POST", label: "Post" },
  { value: "SMS", label: "SMS" },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function toDateInput(val: string | null): string {
  if (!val) return "";
  try {
    return new Date(val).toISOString().split("T")[0];
  } catch {
    return "";
  }
}

function FeedbackBanner({
  message,
  variant,
}: {
  message: string;
  variant: "success" | "error";
}) {
  return (
    <p
      className={`text-xs font-medium mt-2 ${
        variant === "success" ? "text-green-600" : "text-red-500"
      }`}
    >
      {message}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/*  Tenant form                                                        */
/* ------------------------------------------------------------------ */

function TenantForm({
  schemeId,
  lotId,
  tenant,
  tenantNumber,
}: {
  schemeId: string;
  lotId: string;
  tenant: TenantData | undefined;
  tenantNumber: number;
}) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    message: string;
    variant: "success" | "error";
  } | null>(null);

  function handleSubmit(formData: FormData) {
    setFeedback(null);
    startTransition(async () => {
      const result = await updateTenantAction(
        schemeId,
        lotId,
        tenantNumber,
        formData,
      );
      if (result.error) {
        setFeedback({ message: result.error, variant: "error" });
      } else {
        setFeedback({ message: "Tenant details saved.", variant: "success" });
        setTimeout(() => setFeedback(null), 3000);
      }
    });
  }

  return (
    <Card>
      <CardHeader title={`Tenant ${tenantNumber} Details`} />
      <form action={handleSubmit} className="space-y-4">
        {/* Checkboxes */}
        <div className="flex flex-wrap gap-6">
          <CheckboxField
            label="Owner Occupier"
            name="isOwnerOccupier"
            defaultChecked={tenant?.isOwnerOccupier ?? false}
          />
          <CheckboxField
            label="Formal Tenant"
            name="isFormalTenant"
            defaultChecked={tenant?.isFormalTenant ?? false}
          />
        </div>

        {/* Date Received + Delivery By */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            label="Date Received"
            name="dateReceived"
            type="date"
            defaultValue={toDateInput(tenant?.dateReceived ?? null)}
          />
          <SelectField
            label="Delivery By"
            name="deliveryBy"
            options={deliveryOptions}
            defaultValue={tenant?.deliveryBy ?? "EMAIL"}
          />
        </div>

        {/* Salutation + Name */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            label="Salutation"
            name="salutation"
            defaultValue={tenant?.salutation ?? ""}
            placeholder="e.g. Mr, Mrs, Dr"
          />
          <FormField
            label="Name"
            name="name"
            defaultValue={tenant?.name ?? ""}
          />
        </div>

        {/* Contact Name + Mobile */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            label="Contact Name"
            name="contactName"
            defaultValue={tenant?.contactName ?? ""}
          />
          <FormField
            label="Mobile"
            name="mobile"
            type="tel"
            defaultValue={tenant?.mobile ?? ""}
          />
        </div>

        {/* Email */}
        <FormField
          label="Email"
          name="email"
          type="email"
          defaultValue={tenant?.email ?? ""}
        />

        {/* Lease Start + Lease Expiry */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            label="Lease Start"
            name="leaseStart"
            type="date"
            defaultValue={toDateInput(tenant?.leaseStart ?? null)}
          />
          <FormField
            label="Lease Expiry"
            name="leaseExpiry"
            type="date"
            defaultValue={toDateInput(tenant?.leaseExpiry ?? null)}
          />
        </div>

        {/* Notes */}
        <TextareaField
          label="Notes"
          name="notes"
          defaultValue={tenant?.notes ?? ""}
          rows={3}
        />

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          {feedback && (
            <FeedbackBanner
              message={feedback.message}
              variant={feedback.variant}
            />
          )}
        </div>
      </form>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Property Manager form                                              */
/* ------------------------------------------------------------------ */

function PropertyManagerForm({
  schemeId,
  lotId,
  manager,
}: {
  schemeId: string;
  lotId: string;
  manager: PropertyManagerData | null;
}) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    message: string;
    variant: "success" | "error";
  } | null>(null);

  function handleSubmit(formData: FormData) {
    setFeedback(null);
    startTransition(async () => {
      const result = await updatePropertyManagerAction(
        schemeId,
        lotId,
        formData,
      );
      if (result.error) {
        setFeedback({ message: result.error, variant: "error" });
      } else {
        setFeedback({
          message: "Property manager saved.",
          variant: "success",
        });
        setTimeout(() => setFeedback(null), 3000);
      }
    });
  }

  return (
    <Card>
      <CardHeader title="Property Manager" />
      <form action={handleSubmit} className="space-y-4">
        {/* Agent + Company */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            label="Agent"
            name="agentName"
            defaultValue={manager?.agentName ?? ""}
          />
          <FormField
            label="Company"
            name="company"
            defaultValue={manager?.company ?? ""}
          />
        </div>

        {/* Address */}
        <FormField
          label="Address"
          name="address"
          defaultValue={manager?.address ?? ""}
        />

        {/* Agent Email + Phone */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            label="Agent Email"
            name="agentEmail"
            type="email"
            defaultValue={manager?.agentEmail ?? ""}
          />
          <FormField
            label="Phone"
            name="phone"
            type="tel"
            defaultValue={manager?.phone ?? ""}
          />
        </div>

        {/* Fax + Email */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            label="Fax"
            name="fax"
            type="tel"
            defaultValue={manager?.fax ?? ""}
          />
          <FormField
            label="Email"
            name="email"
            type="email"
            defaultValue={manager?.email ?? ""}
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          {feedback && (
            <FeedbackBanner
              message={feedback.message}
              variant={feedback.variant}
            />
          )}
        </div>
      </form>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function TenancyDetails({
  schemeId,
  lotId,
  tenants,
  propertyManager,
}: TenancyDetailsProps) {
  const tenant1 = tenants.find((t) => t.tenantNumber === 1);
  const tenant2 = tenants.find((t) => t.tenantNumber === 2);

  return (
    <div className="space-y-6">
      {/* Tenant columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TenantForm
          schemeId={schemeId}
          lotId={lotId}
          tenant={tenant1}
          tenantNumber={1}
        />
        <TenantForm
          schemeId={schemeId}
          lotId={lotId}
          tenant={tenant2}
          tenantNumber={2}
        />
      </div>

      {/* Property Manager */}
      <PropertyManagerForm
        schemeId={schemeId}
        lotId={lotId}
        manager={propertyManager}
      />
    </div>
  );
}
