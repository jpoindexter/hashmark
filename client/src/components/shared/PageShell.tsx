import type { CSSProperties, ReactNode } from "react";

interface PageShellProps {
  children: ReactNode;
  /** Max content width. Default 860. Use "full" for full-width pages like Agents. */
  maxWidth?: number | "full";
  padding?: string;
  style?: CSSProperties;
}

/**
 * Standard page wrapper — full-height scroll container + centered content block.
 * Apply to every non-home page as the outermost wrapper.
 */
export function PageShell({ children, maxWidth = 860, padding = "32px 28px", style }: PageShellProps) {
  return (
    <div style={{
      flex: 1,
      overflowY: "auto",
      background: "var(--bg)",
      minHeight: 0,
    }}>
      <div style={{
        maxWidth: maxWidth === "full" ? undefined : maxWidth,
        margin: maxWidth === "full" ? undefined : "0 auto",
        padding,
        ...style,
      }}>
        {children}
      </div>
    </div>
  );
}

/** Consistent page header: title + optional right-side actions */
export function PageHeader({ title, subtitle, actions }: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div style={{
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 28,
      flexWrap: "wrap",
    }}>
      <div>
        <div style={{
          fontFamily: "var(--font)",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--text)",
          letterSpacing: "0.02em",
        }}>
          {title}
        </div>
        {subtitle && (
          <div style={{
            fontFamily: "var(--font)",
            fontSize: 10,
            color: "var(--text-dimmer)",
            marginTop: 3,
            letterSpacing: "0.03em",
          }}>
            {subtitle}
          </div>
        )}
      </div>
      {actions && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {actions}
        </div>
      )}
    </div>
  );
}
