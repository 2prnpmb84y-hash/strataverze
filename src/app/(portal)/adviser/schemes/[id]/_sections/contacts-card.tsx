import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import type { getContactsForScheme } from "@/lib/queries/contacts";

/** Moved unchanged from the scheme main page so it can also back its section page. */
export function ContactsCard({
  id, contacts,
}: {
  id: string;
  contacts: Awaited<ReturnType<typeof getContactsForScheme>>;
}) {
  return (
    <Card className="mb-6">
      <CardHeader
        title="Contacts Directory"
        description={
          contacts.length === 0
            ? "No contacts added yet."
            : `${contacts.length} contact${contacts.length === 1 ? "" : "s"} on file.`
        }
        action={
          <Button href={`/adviser/schemes/${id}/contacts/new`} variant="secondary">
            New Contact
          </Button>
        }
      />
      {contacts.length > 0 ? (
        <div className="flex flex-col gap-2">
          {contacts.map((contact) => {
            const contactCategoryLabels: Record<string, string> = {
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

            return (
              <Link
                key={contact.id}
                href={`/adviser/schemes/${id}/contacts/${contact.id}`}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3 hover:bg-muted/70 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-ink">
                    {contact.name}
                    {contact.company ? (
                      <span className="font-normal text-ink-muted">
                        {" "}
                        — {contact.company}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {contactCategoryLabels[contact.category] ?? contact.category}
                    {contact.phone && ` · ${contact.phone}`}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {contact.isPreferred ? (
                    <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 px-2.5 py-0.5 text-xs font-medium">
                      Preferred
                    </span>
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          Add contractors and service providers for this scheme.
        </p>
      )}
    </Card>
  );
}
