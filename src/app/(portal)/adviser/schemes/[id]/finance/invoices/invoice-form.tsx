"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupplierInvoiceAction, ActionState } from "../actions";
import {
  FormField,
  SelectField,
  TextareaField,
} from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";

interface Props {
  schemeId: string;
  suppliers: { id: string; companyName: string }[];
  accountCodes: { id: string; code: string; name: string }[];
  funds: { id: string; name: string }[];
}

export function InvoiceForm({
  schemeId,
  suppliers,
  accountCodes,
  funds,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [subtotal, setSubtotal] = useState(0);
  const [gstAmount, setGstAmount] = useState(0);
  const totalAmount = subtotal + gstAmount;

  const supplierOptions = [
    { value: "", label: "Select..." },
    ...suppliers.map((s) => ({ value: s.id, label: s.companyName })),
  ];

  const accountCodeOptions = [
    { value: "", label: "Select..." },
    ...accountCodes.map((a) => ({
      value: a.id,
      label: `${a.code} — ${a.name}`,
    })),
  ];

  const fundOptions = [
    { value: "", label: "Select..." },
    ...funds.map((f) => ({ value: f.id, label: f.name })),
  ];

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(undefined);
    setFieldErrors({});

    const form = new FormData(e.currentTarget);

    startTransition(async () => {
      const result: ActionState = await createSupplierInvoiceAction(schemeId, {
        supplierId: form.get("supplierId") as string,
        invoiceNumber: form.get("invoiceNumber") as string,
        invoiceDate: form.get("invoiceDate") as string,
        dueDate: form.get("dueDate") as string,
        subtotal,
        gstAmount,
        totalAmount,
        description: (form.get("description") as string) ?? "",
        accountCodeId: form.get("accountCodeId") as string,
        fundId: form.get("fundId") as string,
      });

      if (result.fieldErrors) {
        setFieldErrors(result.fieldErrors);
      }
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.success) {
        router.push(`/adviser/schemes/${schemeId}/finance/invoices`);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <SelectField
        label="Supplier"
        name="supplierId"
        required
        options={supplierOptions}
        error={fieldErrors.supplierId}
      />

      <FormField
        label="Invoice Number"
        name="invoiceNumber"
        type="text"
        required
        placeholder="e.g. INV-001"
        error={fieldErrors.invoiceNumber}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          label="Invoice Date"
          name="invoiceDate"
          type="date"
          required
          error={fieldErrors.invoiceDate}
        />
        <FormField
          label="Due Date"
          name="dueDate"
          type="date"
          required
          error={fieldErrors.dueDate}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FormField
          label="Subtotal ($)"
          name="subtotal"
          type="number"
          required
          value={subtotal || ""}
          placeholder="0.00"
          onChange={(e) => setSubtotal(parseFloat(e.target.value) || 0)}
          error={fieldErrors.subtotal}
        />
        <FormField
          label="GST Amount ($)"
          name="gstAmount"
          type="number"
          required
          value={gstAmount || ""}
          placeholder="0.00"
          helpText="10% GST where applicable"
          onChange={(e) => setGstAmount(parseFloat(e.target.value) || 0)}
          error={fieldErrors.gstAmount}
        />
        <FormField
          label="Total Amount ($)"
          name="totalAmount"
          type="number"
          required
          value={totalAmount || ""}
          placeholder="0.00"
          onChange={() => {}}
          error={fieldErrors.totalAmount}
        />
      </div>

      <TextareaField
        label="Description"
        name="description"
        placeholder="Brief description of the invoice"
        error={fieldErrors.description}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          label="Account Code"
          name="accountCodeId"
          required
          options={accountCodeOptions}
          error={fieldErrors.accountCodeId}
        />
        <SelectField
          label="Fund"
          name="fundId"
          required
          options={fundOptions}
          error={fieldErrors.fundId}
        />
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? "Creating..." : "Create Invoice"}
        </Button>
      </div>
    </form>
  );
}
