/** The request fields of a certificate form (pure, shared by the new and edit pages). */
import type { FieldSpec } from "@/components/records/records-forms";

export function requesterFields(input: {
  requesterTypes: Readonly<Record<string, string>>;
  today: string;
  values?: Partial<Record<"requestedOn" | "requesterType" | "requesterName" | "requesterAddress" | "authorisedByType" | "authorisedByName" | "authorisedByAddress", string | null>>;
}): FieldSpec[] {
  const v = input.values ?? {};
  const types = Object.entries(input.requesterTypes).map(([value, label]) => ({ value, label }));
  return [
    { name: "requestedOn", label: "Date the request was received", type: "date", max: input.today, defaultValue: v.requestedOn ?? input.today },
    { name: "requesterType", label: "Who is asking", type: "select", options: types, defaultValue: v.requesterType ?? "OWNER" },
    { name: "requesterName", label: "Their name", type: "text", defaultValue: v.requesterName ?? "" },
    { name: "requesterAddress", label: "Their address", type: "text", defaultValue: v.requesterAddress ?? "" },
    { name: "authorisedByType", label: "If authorised: who authorised them", type: "select", required: false, options: types.filter((t) => t.value !== "AUTHORISED_PERSON"), defaultValue: v.authorisedByType ?? "" },
    { name: "authorisedByName", label: "If authorised: that person's name", type: "text", required: false, defaultValue: v.authorisedByName ?? "" },
    { name: "authorisedByAddress", label: "If authorised: that person's address", type: "text", required: false, defaultValue: v.authorisedByAddress ?? "", wide: true },
  ];
}
