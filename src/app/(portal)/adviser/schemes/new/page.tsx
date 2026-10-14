import { PageHeader } from "@/components/ui/page-header";
import { SchemeForm } from "../scheme-form";

export default function NewSchemePage() {
  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Add Scheme"
        description="Register a new Owners Corporation."
        backHref="/adviser/schemes"
        backLabel="Schemes"
      />

      <SchemeForm mode="create" />
    </div>
  );
}
