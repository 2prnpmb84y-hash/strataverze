export default function AdviserDashboard() {
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold font-heading text-foreground mb-1">
        Adviser Dashboard
      </h1>
      <p className="text-sm text-muted-foreground mb-8">
        Oversee schemes, reporting, and operational compliance.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Managed Schemes"
          value="0"
          accent="bg-adviser"
        />
        <StatCard
          label="Overdue Actions"
          value="0"
          accent="bg-adviser"
        />
        <StatCard
          label="Reports Due"
          value="0"
          accent="bg-adviser"
        />
      </div>

      <div className="mt-8 rounded-xl bg-card border border-border p-6">
        <h2 className="font-heading font-semibold text-foreground mb-2">
          Getting Started
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Welcome to the Adviser Portal. Once schemes are assigned to your
          account, you will manage operations, generate reports, and monitor
          compliance deadlines across your portfolio from here.
        </p>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl bg-card border border-border p-5">
      <div className={`w-2.5 h-2.5 rounded-full ${accent} mb-3`} />
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">
        {label}
      </p>
      <p className="text-2xl font-bold font-heading text-card-foreground">
        {value}
      </p>
    </div>
  );
}
