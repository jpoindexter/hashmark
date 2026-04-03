import type { CSSProperties, ReactNode } from "react";

interface PageShellProps {
  children: ReactNode;
  maxWidth?: number | "full";
  padding?: string;
  style?: CSSProperties;
}

export function PageShell({ children, maxWidth = 860, padding, style }: PageShellProps) {
  const isFullWidth = maxWidth === "full";
  return (
    <div className="page-shell">
      <div
        className={isFullWidth ? "page-content-full" : "page-content"}
        style={{
          ...(isFullWidth ? undefined : { maxWidth }),
          ...(padding ? { padding } : undefined),
          ...style,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <div className="page-header-title">{title}</div>
        {subtitle && <div className="page-header-subtitle">{subtitle}</div>}
      </div>
      {actions && (
        <div className="flex-row flex-wrap gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
