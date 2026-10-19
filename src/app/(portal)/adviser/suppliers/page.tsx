import Link from "next/link";
import { getCurrentProfile } from "@/lib/queries/profiles";
import { getSchemesForAdviser } from "@/lib/queries/schemes";
import { getContactsForSchemes } from "@/lib/queries/contacts";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
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

export default async function AdviserSuppliersPage() {
  await connection();
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const schemes = await getSchemesForAdviser(profile.id);
  const schemeIds = schemes.map((s) => s.id);
  const schemeNames = new Map(schemes.map((s) => [s.id, s.name]));

  const contacts = schemeIds.length > 0
    ? await getContactsForSchemes(schemeIds)
    : [];

  const preferred = contacts.filter((c) => c.isPreferred);

  // Count unique categories
  const categories = new Set(contacts.map((c) => c.category));

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Suppliers & Contacts"
        description="Service providers and contractors across all managed schemes."
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard
          label="Total Contacts"
          value={contacts.length}
          accent="bg-adviser"
        />
        <StatCard
          label="Preferred"
          value={preferred.length}
          accent="bg-amber-500"
        />
        <StatCard
          label="Categories"
          value={categories.size}
          accent="bg-turquoise"
        />
        <StatCard
          label="Schemes"
          value={schemes.length}
          accent="bg-blue-500"
        />
      </div>

      {contacts.length === 0 ? (
        <Card>
          <div className="p-6 text-center">
            <p className="text-sm text-ink-muted">
              No contacts added yet across your managed schemes.
            </p>
          </div>
        </Card>
      ) : (
        <Card>
          <CardHeader
            title="All Contacts"
            description={`${contacts.length} contact${contacts.length === 1 ? "" : "s"} across ${schemes.length} scheme${schemes.length === 1 ? "" : "s"}.`}
          />
          <div className="flex flex-col gap-2">
            {contacts.map((contact) => (
              <Link
                key={contact.id}
                href={`/adviser/schemes/${contact.schemeId}/contacts/${contact.id}`}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3 hover:bg-muted/70 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink truncate">
                    {contact.name}
                    {contact.company ? (
                      <span className="font-normal text-ink-muted">
                        {" "}— {contact.company}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {schemeNames.get(contact.schemeId) ?? ""}
                    {" · "}
                    {categoryLabels[contact.category] ?? contact.category}
                    {contact.phone && ` · ${contact.phone}`}
                  </p>
                </div>
                <div className="shrink-0 ml-3 flex items-center gap-1.5">
                  {contact.isPreferred ? (
                    <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 px-2.5 py-0.5 text-xs font-medium">
                      Preferred
                    </span>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
