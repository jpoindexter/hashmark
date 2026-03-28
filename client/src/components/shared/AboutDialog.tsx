import { useState, useEffect, useCallback, useRef } from "react";
import { fetchApi } from "../../lib/api";
import { useFocusTrap } from "../../hooks/useFocusTrap";

interface DetectedCLI {
  id: string;
  name: string;
  installed: boolean;
  version?: string;
}

interface AboutInfo {
  version: string;
  nodeVersion: string;
  electronVersion: string;
  clis: DetectedCLI[];
}

export default function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [info, setInfo] = useState<AboutInfo | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const load = async () => {
      const [infoRes, cliRes] = await Promise.allSettled([
        fetchApi("/api/info").then(r => r.json()),
        fetchApi("/api/providers/detect").then(r => r.json()),
      ]);

      if (cancelled) return;

      const infoData = infoRes.status === "fulfilled" ? infoRes.value : {};
      const cliData = cliRes.status === "fulfilled" ? cliRes.value : { tools: [] };

      const electronVersion =
        typeof window !== "undefined" && (window as Record<string, unknown>).process
          ? ((window as Record<string, unknown>).process as Record<string, Record<string, string>>)?.versions?.electron ?? ""
          : "";

      setInfo({
        version: infoData.version ?? "0.1.0",
        nodeVersion: infoData.nodeVersion ?? "unknown",
        electronVersion,
        clis: (cliData.tools ?? cliData ?? []).filter((c: DetectedCLI) => c.installed),
      });
    };

    load();
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const openExternal = useCallback((url: string) => {
    const studio = (window as Record<string, unknown>).studio as
      { openExternal?: (url: string) => void } | undefined;
    if (studio?.openExternal) {
      studio.openExternal(url);
    } else {
      window.open(url, "_blank", "noopener");
    }
  }, []);

  if (!open) return null;

  const links = [
    { label: "GitHub", url: "https://github.com/jpoindexter/hashmark" },
    { label: "Docs", url: "https://hashmark.md" },
    { label: "Feedback", url: "https://github.com/jpoindexter/hashmark/issues" },
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--overlay-bg)",
        backdropFilter: "blur(4px)",
        animation: "fadeIn 0.1s ease",
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="About hashmark studio"
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: "32px 36px",
          minWidth: 340,
          maxWidth: 400,
          boxShadow: "var(--shadow-lg)",
          fontFamily: "var(--font-ui)",
          animation: "dropdownIn 0.15s ease-out",
          textAlign: "center",
        }}
      >
        {/* Logo */}
        <div style={{
          fontSize: 48,
          fontWeight: 700,
          fontFamily: "var(--font)",
          color: "var(--accent)",
          lineHeight: 1,
          marginBottom: 8,
          userSelect: "none",
        }}>
          #
        </div>

        {/* Name */}
        <div style={{
          fontSize: 16,
          fontWeight: 600,
          color: "var(--text)",
          letterSpacing: "-0.01em",
          marginBottom: 4,
        }}>
          hashmark studio
        </div>

        {/* Version */}
        <div style={{
          fontSize: 12,
          color: "var(--text-dimmer)",
          fontFamily: "var(--font)",
          marginBottom: 20,
        }}>
          {info ? `v${info.version}` : "..."}
        </div>

        {/* System info */}
        <div style={{
          background: "var(--bg-3)",
          border: "1px solid var(--border-dim)",
          borderRadius: "var(--radius)",
          padding: "10px 14px",
          marginBottom: 16,
          textAlign: "left",
        }}>
          <InfoRow label="Node" value={info?.nodeVersion ?? "..."} />
          <InfoRow label="Electron" value={info?.electronVersion || "N/A"} last={!info?.clis?.length} />

          {/* Detected CLIs */}
          {info?.clis && info.clis.length > 0 && (
            <>
              <div style={{
                height: 1,
                background: "var(--border-dim)",
                margin: "8px 0",
              }} />
              <div style={{
                fontSize: 10,
                color: "var(--text-dimmer)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 6,
              }}>
                CLI Tools
              </div>
              {info.clis.map((cli, i) => (
                <InfoRow
                  key={cli.id}
                  label={cli.name}
                  value={cli.version ?? "installed"}
                  accent
                  last={i === info.clis.length - 1}
                />
              ))}
            </>
          )}
        </div>

        {/* Links */}
        <div style={{
          display: "flex",
          justifyContent: "center",
          gap: 8,
          marginBottom: 20,
        }}>
          {links.map(({ label, url }) => (
            <LinkButton key={label} label={label} onClick={() => openExternal(url)} />
          ))}
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          style={{
            padding: "6px 24px",
            fontSize: 12,
            fontFamily: "var(--font-ui)",
            fontWeight: 600,
            background: "var(--bg-3)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            color: "var(--text-dim)",
            cursor: "pointer",
            transition: "background 0.1s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-4)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "var(--bg-3)"; }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  accent,
  last,
}: {
  label: string;
  value: string;
  accent?: boolean;
  last?: boolean;
}) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: last ? 0 : 4,
    }}>
      <span style={{
        fontSize: 11,
        color: "var(--text-dim)",
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 11,
        color: accent ? "var(--accent)" : "var(--text-dimmer)",
        fontFamily: "var(--font)",
      }}>
        {value}
      </span>
    </div>
  );
}

function LinkButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--accent-bg)";
        e.currentTarget.style.color = "var(--accent)";
        e.currentTarget.style.borderColor = "var(--accent-border)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--text-dim)";
        e.currentTarget.style.borderColor = "var(--border-dim)";
      }}
      style={{
        padding: "4px 12px",
        fontSize: 11,
        fontFamily: "var(--font-ui)",
        fontWeight: 500,
        background: "transparent",
        border: "1px solid var(--border-dim)",
        borderRadius: "var(--radius)",
        color: "var(--text-dim)",
        cursor: "pointer",
        transition: "background 0.1s, color 0.1s, border-color 0.1s",
      }}
    >
      {label}
    </button>
  );
}
