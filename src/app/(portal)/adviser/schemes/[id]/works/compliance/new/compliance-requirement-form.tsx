"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FormField,
  TextareaField,
  CheckboxField,
  SelectField,
} from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import {
  createComplianceRequirement,
  updateComplianceRequirement,
  type ActionResult,
} from "@/lib/actions/works";

type RequirementData = {
  id: string;
  name: string;
  description: string | null;
  layer: string;
  documentType: string;
  isMandatory: boolean;
  validityPeriod: number | null;
  tradeCategories: string[];
  isActive: boolean;
};

export function ComplianceRequirementForm({
  schemeId,
  requirement,
}: {
  schemeId: string;
  requirement?: RequirementData;
}) {
  const router = useRouter();
  const isEditing = !!requirement;

  const wrappedAction = async (
    _prev: ActionResult,
    formData: FormData,
  ): Promise<ActionResult> => {
    if (isEditing) {
      return updateComplianceRequirement(formData);
    }
    return createComplianceRequirement(formData);
  };

  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    wrappedAction,
    { error: null },
  );

  useEffect(() => {
    if (state.success) {
      router.push(`/adviser/schemes/${schemeId}/works/compliance`);
    }
  }, [state.success, router, schemeId]);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="schemeId" value={schemeId} />
      {isEditing && (
        <input type="hidden" name="requirementId" value={requirement.id} />
      )}

      {state.error && (
        <div className="rounded-[var(--radius-card)] bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-700">{state.error}</p>
        </div>
      )}

      <FormField
        label="Requirement Name"
        name="name"
        required
        defaultValue={requirement?.name}
        placeholder="e.g. Public Liability Insurance"
      />

      <TextareaField
        label="Description"
        name="description"
        defaultValue={requirement?.description ?? ""}
        rows={3}
        placeholder="Describe the requirement, including any specific standards or conditions..."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SelectField
          label="Layer"
          name="layer"
          required
          defaultValue={requirement?.layer}
          options={[
            { value: "", label: "Select layer" },
            { value: "SUPPLIER", label: "Supplier" },
            { value: "JOB", label: "Job" },
            { value: "SITE", label: "Site" },
          ]}
        />

        <SelectField
          label="Document Type"
          name="documentType"
          required
          defaultValue={requirement?.documentType}
          options={[
            { value: "", label: "Select document type" },
            { value: "LICENCE", label: "Licence" },
            { value: "INSURANCE", label: "Insurance" },
            { value: "CERTIFICATE", label: "Certificate" },
            { value: "INDUCTION", label: "Induction" },
            { value: "SAFE_WORK_METHOD", label: "Safe Work Method Statement" },
            { value: "OTHER", label: "Other" },
          ]}
        />
      </div>

      <FormField
        label="Validity Period (days)"
        name="validityPeriod"
        type="number"
        defaultValue={requirement?.validityPeriod?.toString() ?? ""}
        placeholder="e.g. 365"
        helpText="Number of days before the document expires and needs renewal"
      />

      <FormField
        label="Trade Categories"
        name="tradeCategories"
        defaultValue={requirement?.tradeCategories?.join(", ") ?? ""}
        placeholder="e.g. Plumbing, Electrical, Fire Safety"
        helpText="Comma-separated list of applicable trades (leave empty for all trades)"
      />

      <div className="flex items-center gap-6">
        <CheckboxField
          label="Mandatory"
          name="isMandatory"
          defaultChecked={requirement?.isMandatory ?? true}
          helpText="Contractors cannot proceed without this requirement"
        />

        {isEditing && (
          <CheckboxField
            label="Active"
            name="isActive"
            defaultChecked={requirement?.isActive ?? true}
            helpText="Inactive requirements are not enforced"
          />
        )}
      </div>

      <div className="flex items-center gap-3 pt-2 border-t border-line">
        <Button type="submit" disabled={isPending}>
          {isPending
            ? isEditing
              ? "Saving..."
              : "Creating..."
            : isEditing
              ? "Save Changes"
              : "Create Requirement"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
