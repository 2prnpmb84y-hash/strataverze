import { DOCUMENT_VISIBILITIES, VISIBILITY_LABELS } from "@/lib/documents/visibility";

/** The "Who can see it" choices for document forms (S3). */
export const VISIBILITY_OPTIONS = DOCUMENT_VISIBILITIES.map((value) => ({ value, label: VISIBILITY_LABELS[value] }));
