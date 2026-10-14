import { notFound } from "next/navigation";
import { getContactById } from "@/lib/queries/contacts";
import { getSchemeById } from "@/lib/queries/schemes";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { ContactEditForm } from "../contact-form";
import { DeleteContactButton } from "./delete-contact-button";

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

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string; contactId: string }>;
}) {
  const { id, contactId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const scheme = await getSchemeById(id);
  if (!scheme) notFound();

  const isAdviser = scheme.memberships.some(
    (m) => m.profileId === profile.id && m.role === "ADVISER",
  );
  if (!isAdviser) notFound();

  const contact = await getContactById(contactId);
  if (!contact || contact.schemeId !== id) notFound();

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={contact.name}
        description={contact.scheme.name}
        backHref={`/adviser/schemes/${id}`}
        backLabel="Scheme"
      />

      {/* Contact summary */}
      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-4">
          <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 px-2.5 py-0.5 text-xs font-medium">
            {categoryLabels[contact.category] ?? contact.category}
          </span>
          {contact.isPreferred ? (
            <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 px-2.5 py-0.5 text-xs font-medium">
              Preferred
            </span>
          ) : null}
          {contact.company ? (
            <>
              <span>·</span>
              <span>{contact.company}</span>
            </>
          ) : null}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          {contact.phone ? (
            <div>
              <p className="text-xs text-muted-foreground">Phone</p>
              <p className="font-medium text-foreground">{contact.phone}</p>
            </div>
          ) : null}
          {contact.email ? (
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="font-medium text-foreground">{contact.email}</p>
            </div>
          ) : null}
          {contact.address ? (
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground">Address</p>
              <p className="font-medium text-foreground">{contact.address}</p>
            </div>
          ) : null}
        </div>

        {contact.notes ? (
          <div className="mt-4 rounded-lg bg-muted px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Notes
            </p>
            <p className="text-sm text-foreground whitespace-pre-wrap">
              {contact.notes}
            </p>
          </div>
        ) : null}
      </Card>

      {/* Edit form */}
      <Card className="mb-6">
        <CardHeader title="Edit Contact" />
        <ContactEditForm
          schemeId={id}
          contactId={contactId}
          defaults={{
            name: contact.name,
            company: contact.company,
            category: contact.category,
            phone: contact.phone,
            email: contact.email,
            address: contact.address,
            notes: contact.notes,
            isPreferred: contact.isPreferred,
          }}
        />
      </Card>

      {/* Danger zone */}
      <Card className="border-red-200">
        <CardHeader
          title="Danger Zone"
          description="This action cannot be undone."
        />
        <DeleteContactButton schemeId={id} contactId={contactId} />
      </Card>
    </div>
  );
}
