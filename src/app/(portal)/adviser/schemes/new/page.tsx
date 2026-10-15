import { PageHeader } from "@/components/ui/page-header";
import { AddPropertyWizard } from "../add-property-wizard";

export default function NewSchemePage() {
  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Add Property"
        description="Register a new Owners Corporation."
        backHref="/adviser/schemes"
        backLabel="Schemes"
      />

      <AddPropertyWizard />
    </div>
  );
}
