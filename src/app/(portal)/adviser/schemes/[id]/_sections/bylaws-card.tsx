import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import type { getBylawsForScheme } from "@/lib/queries/bylaws";

/** Moved unchanged from the scheme main page so it can also back its section page. */
export function BylawsCard({
  id, bylaws,
}: {
  id: string;
  bylaws: Awaited<ReturnType<typeof getBylawsForScheme>>;
}) {
  return (
    <Card className="mb-6">
      <CardHeader
        title="By-laws Register"
        description={
          bylaws.length === 0
            ? "No by-laws registered yet."
            : `${bylaws.length} by-law${bylaws.length === 1 ? "" : "s"} registered.`
        }
        action={
          <Button href={`/adviser/schemes/${id}/bylaws/new`} variant="secondary">
            New By-law
          </Button>
        }
      />
      {bylaws.length > 0 ? (
        <div className="flex flex-col gap-2">
          {bylaws.map((bylaw) => {
            const bylawStatusStyle: Record<string, string> = {
              ACTIVE: "bg-green-100 text-green-700",
              AMENDED: "bg-amber-100 text-amber-700",
              REPEALED: "bg-red-100 text-red-700",
            };

            const bylawStatusLabel: Record<string, string> = {
              ACTIVE: "Active",
              AMENDED: "Amended",
              REPEALED: "Repealed",
            };

            const bylawCategoryLabels: Record<string, string> = {
              GENERAL: "General",
              SAFETY: "Safety",
              PARKING: "Parking",
              PETS: "Pets",
              NOISE: "Noise",
              APPEARANCE: "Appearance",
              BEHAVIOUR: "Behaviour",
              OTHER: "Other",
            };

            return (
              <Link
                key={bylaw.id}
                href={`/adviser/schemes/${id}/bylaws/${bylaw.id}`}
                className="flex items-center justify-between rounded-[var(--radius-card)] bg-muted px-4 py-3 hover:bg-muted/70 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-ink">
                    {bylaw.bylawNumber}. {bylaw.title}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {bylawCategoryLabels[bylaw.category] ?? bylaw.category}
                    {" · Effective "}
                    {new Date(String(bylaw.effectiveDate)).toLocaleDateString(
                      "en-AU",
                      { day: "numeric", month: "short", year: "numeric" },
                    )}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${bylawStatusStyle[bylaw.status] ?? "bg-gray-100 text-gray-700"}`}
                >
                  {bylawStatusLabel[bylaw.status] ?? bylaw.status}
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          Register by-laws to track the rules governing this scheme.
        </p>
      )}
    </Card>
  );
}
