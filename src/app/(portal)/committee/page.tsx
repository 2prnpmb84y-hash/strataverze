import { StatCard } from "@/components/ui/stat-card";

export default function CommitteeDashboard() {
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold font-heading text-foreground mb-1">
        Committee Dashboard
      </h1>
      <p className="text-sm text-muted-foreground mb-8">
        Manage finances, compliance, and governance for your scheme.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Admin Fund Balance"
          value="$0.00"
          accent="bg-committee"
        />
        <StatCard
          label="Pending Motions"
          value="0"
          accent="bg-committee"
        />
        <StatCard
          label="Compliance Items"
          value="0"
          accent="bg-committee"
        />
      </div>

      <div className="mt-8 rounded-xl bg-card border border-border p-6">
        <h2 className="font-heading font-semibold text-foreground mb-2">
          Getting Started
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Welcome to the Committee Portal. Once your scheme is configured,
          you will manage fund budgets, schedule meetings, raise motions, and
          track compliance obligations from here.
        </p>
      </div>
    </div>
  );
}
