"use client";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  /**
   * Small uppercase label above the title (e.g., "Account", "Projects")
   */
  label?: string;
  /**
   * Main page title
   */
  title: string;
  /**
   * Optional description below the title
   */
  description?: string;
  /**
   * Optional actions to render on the right side
   */
  actions?: React.ReactNode;
  /**
   * Additional className for the container
   */
  className?: string;
}

/**
 * Consistent page header component for non-chat pages.
 * Provides a standard layout with optional label, title, description, and actions.
 */
export function PageHeader({
  label,
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="space-y-1">
        {label && (
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
        )}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
