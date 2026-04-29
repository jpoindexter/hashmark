import { useEffect, useState } from "react";
import { fetchApi } from "../lib/api";
import type { Session } from "../types";

interface WelcomeScreenProps {
  onNew: () => void;
  onPalette: () => void;
  onSettings?: () => void;
  onConnect?: () => void;
}

export function WelcomeScreen({ onNew, onPalette, onSettings, onConnect }: WelcomeScreenProps) {
  const [recentDirs, setRecentDirs] = useState<string[]>([]);

  useEffect(() => {
    fetchApi<Session[]>("/api/sessions").then(sessions => {
      const seen = new Set<string>();
      const dirs: string[] = [];
      for (const s of sessions) {
        if (s.project_dir && !seen.has(s.project_dir)) {
          seen.add(s.project_dir);
          dirs.push(s.project_dir);
          if (dirs.length >= 5) break;
        }
      }
      setRecentDirs(dirs);
    }).catch(() => {});
  }, []);

  const basename = (p: string) => p.split("/").filter(Boolean).pop() ?? p;
  const parentDir = (p: string) => {
    const parts = p.split("/").filter(Boolean);
    parts.pop();
    return "~/" + parts.slice(-2).join("/");
  };

  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "var(--bg)", padding: "40px 20px", overflow: "auto",
    }}>
      <div style={{ width: "100%", maxWidth: 440 }}>

        {/* Logo + title */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{
            width: 48, height: 48, margin: "0 auto 16px",
            border: "1.5px solid var(--border)", borderRadius: 10,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--text-dim)", fontSize: 22,
          }}>
            ✦
          </div>
          <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text)", letterSpacing: "-0.01em" }}>
            hashmark
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
            local multi-agent coding harness
          </div>
        </div>

        {/* Get Started */}
        <Section label="Get Started">
          <ActionRow icon="+" label="New Session" shortcut="⌘N" onClick={onNew} />
          <ActionRow icon="⌘" label="Command Palette" shortcut="⌘K" onClick={onPalette} />
        </Section>

        {/* Configure */}
        <Section label="Configure">
          <ActionRow icon="⚙" label="Settings" onClick={onSettings} />
          <ActionRow icon="⊕" label="Connect Provider" onClick={onConnect} />
        </Section>

        {/* Recent projects */}
        {recentDirs.length > 0 && (
          <Section label="Recent">
            {recentDirs.map(dir => (
              <ActionRow
                key={dir}
                icon="◫"
                label={basename(dir)}
                sublabel={parentDir(dir)}
                onClick={onNew}
              />
            ))}
          </Section>
        )}

        {/* Tips */}
        <Section label="Tips">
          <Tip shortcut="@file" text="Mention files in chat to include them as context" />
          <Tip shortcut="/skill" text="Browse and inject prompt skills into the composer" />
          <Tip shortcut="Split" text="Click any session while one is open to split panes" />
          <Tip shortcut="Think" text="Enable extended reasoning in the composer toolbar" />
        </Section>

      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color: "var(--text-muted)",
          textTransform: "uppercase", letterSpacing: "0.08em", flexShrink: 0,
        }}>
          {label}
        </span>
        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
      </div>
      {children}
    </div>
  );
}

function ActionRow({ icon, label, sublabel, shortcut, onClick }: {
  icon: string;
  label: string;
  sublabel?: string;
  shortcut?: string;
  onClick?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        width: "100%", textAlign: "left", background: hovered && onClick ? "var(--bg-hover)" : "none",
        border: "none", cursor: onClick ? "pointer" : "default",
        padding: "6px 8px", borderRadius: "var(--radius-sm)",
        transition: "background var(--transition)",
      }}
    >
      <span style={{ fontSize: 13, color: "var(--text-muted)", width: 16, textAlign: "center", flexShrink: 0 }}>
        {icon}
      </span>
      <span style={{ flex: 1, fontSize: 13, color: onClick ? "var(--text-dim)" : "var(--text-muted)" }}>
        {label}
      </span>
      {sublabel && (
        <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
          {sublabel}
        </span>
      )}
      {shortcut && (
        <span style={{
          fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)",
          flexShrink: 0,
        }}>
          {shortcut}
        </span>
      )}
    </button>
  );
}

function Tip({ shortcut, text }: { shortcut: string; text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "5px 8px" }}>
      <span style={{
        fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)",
        background: "var(--bg-elevated)", border: "1px solid var(--border)",
        padding: "1px 5px", borderRadius: 3, flexShrink: 0,
      }}>
        {shortcut}
      </span>
      <span style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4 }}>{text}</span>
    </div>
  );
}
