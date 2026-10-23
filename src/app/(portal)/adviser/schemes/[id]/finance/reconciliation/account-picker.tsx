"use client";

import { useRouter } from "next/navigation";
import { SelectField } from "@/components/ui/form-field";

/** Choose the bank account to reconcile. */
export function AccountPicker({
  schemeId,
  accounts,
  selectedId,
}: {
  schemeId: string;
  accounts: { id: string; label: string }[];
  selectedId: string;
}) {
  const router = useRouter();
  return (
    <SelectField
      label="Bank account"
      name="account"
      value={selectedId}
      options={[{ value: "", label: "Choose an account" }, ...accounts.map((a) => ({ value: a.id, label: a.label }))]}
      onChange={(e) => {
        const id = e.target.value;
        router.push(`/adviser/schemes/${schemeId}/finance/reconciliation${id ? `?account=${encodeURIComponent(id)}` : ""}`);
      }}
    />
  );
}
