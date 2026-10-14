import { Button } from "./button";

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="rounded-xl bg-card border border-border border-dashed p-12 text-center">
      {icon && (
        <div className="flex justify-center mb-4 text-muted-foreground">
          {icon}
        </div>
      )}
      <h3 className="font-heading font-semibold text-card-foreground mb-1">
        {title}
      </h3>
      <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
        {description}
      </p>
      {actionLabel && actionHref && (
        <Button href={actionHref}>{actionLabel}</Button>
      )}
    </div>
  );
}
