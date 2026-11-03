import type { LucideIcon } from "lucide-react";

/**
 * Page title card: icon + title + description on the left; list controls and
 * the page's primary action on the right (they wrap below on small screens).
 */
export function PageHeader({
  icon: Icon,
  title,
  description,
  toolbar,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  toolbar?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Icon className="size-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl leading-tight font-semibold tracking-tight">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {(toolbar || action) && (
        <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
          {toolbar}
          {action}
        </div>
      )}
    </div>
  );
}
