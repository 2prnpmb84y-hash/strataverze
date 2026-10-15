import { Button } from "@/components/ui/button";

export default function ComingSoon() {
  return (
    <div className="max-w-lg mx-auto mt-16 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-50 mb-6">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          className="text-primary-400"
        >
          <path
            d="M12 6v6l4 2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
      </div>
      <h1 className="text-2xl font-bold font-heading text-foreground mb-2">
        Coming Soon
      </h1>
      <p className="text-sm text-muted-foreground mb-8 max-w-sm mx-auto">
        This feature is currently under development and will be available in an
        upcoming release.
      </p>
      <Button variant="secondary" href="/owner/dashboard">
        Back to Dashboard
      </Button>
    </div>
  );
}
