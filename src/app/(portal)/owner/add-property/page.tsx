import { PageHeader } from "@/components/ui/page-header";
import { AddPropertyWizard } from "../../adviser/schemes/add-property-wizard";

export default function OwnerAddPropertyPage() {
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Add Property"
        description="Register a new property to your account."
        backHref="/owner"
        backLabel="Properties"
      />

      <AddPropertyWizard simplified />
    </div>
  );
}
