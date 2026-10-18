import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForOwner } from "@/lib/queries/schemes";
import { getContactsForSchemes } from "@/lib/queries/contacts";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { connection } from "next/server";

const categoryLabels: Record<string, string> = {
  PLUMBER: "Plumber",
  ELECTRICIAN: "Electrician",
  BUILDER: "Builder",
  GARDENER: "Gardener / Landscaper",
  CLEANER: "Cleaner",
  LOCKSMITH: "Locksmith",
  PEST_CONTROL: "Pest Control",
  FIRE_SAFETY: "Fire Safety",
  LIFT: "Lift / Elevator",
  POOL: "Pool Maintenance",
  BODY_CORPORATE: "Body Corporate",
  LEGAL: "Legal",
  ACCOUNTING: "Accounting",
  INSURANCE_BROKER: "Insurance Broker",
  OTHER: "Other",
};

export default async function OwnerContactsPage() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = await getSchemesForOwner(profile.id);
  const schemeIds = schemes.map((s) => s.id);
  const contacts = await getContactsForSchemes(schemeIds);

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Contacts Directory"
        description="Contractors and service providers for your scheme."
        backHref="/owner"
        backLabel="Dashboard"
      />

      {contacts.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            No contacts have been added for your scheme yet.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {contacts.map((contact) => (
            <Card key={contact.id}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {contact.name}
                    {contact.company ? (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        — {contact.company}
                      </span>
                    ) : null}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {contact.scheme.name}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {contact.isPreferred ? (
                    <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 px-2.5 py-0.5 text-xs font-medium">
                      Preferred
                    </span>
                  ) : null}
                  <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 px-2.5 py-0.5 text-xs font-medium">
                    {categoryLabels[contact.category] ?? contact.category}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                {contact.phone ? (
                  <span className="text-foreground">{contact.phone}</span>
                ) : null}
                {contact.email ? (
                  <span className="text-foreground">{contact.email}</span>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
