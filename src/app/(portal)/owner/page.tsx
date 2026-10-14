import { StatCard } from "@/components/ui/stat-card";

export default function OwnerDashboard() {
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold font-heading text-foreground mb-1">
        Owner Dashboard
      </h1>
      <p className="text-sm text-muted-foreground mb-8">
        View your levies, vote on motions, and track maintenance requests.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Outstanding Levies"
          value="$0.00"
          accent="bg-owner"
        />
        <StatCard
          label="Active Motions"
          value="0"
          accent="bg-owner"
        />
        <StatCard
          label="Open Work Orders"
          value="0"
          accent="bg-owner"
        />
      </div>

      <div className="mt-8 rounded-xl bg-card border border-border p-6">
        <h2 className="font-heading font-semibold text-foreground mb-2">
          Getting Started
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Welcome to StrataVerze. Once your strata scheme is set up, you will
          see your levy statements, meeting agendas, and maintenance updates
          here. Contact your committee or strata manager to get connected.
        </p>
      </div>
    </div>
  );
}
