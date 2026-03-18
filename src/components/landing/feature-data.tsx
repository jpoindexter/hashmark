const FORMAT_FILES = [
  { file: "AGENTS.md", x: "50%", y: "10%", primary: true },
  { file: "CLAUDE.md", x: "15%", y: "38%" },
  { file: ".cursorrules", x: "75%", y: "30%" },
  { file: "copilot-instructions.md", x: "10%", y: "68%" },
  { file: ".windsurfrules", x: "60%", y: "70%" },
  { file: "gemini.md", x: "82%", y: "60%" },
];

const ROLES = [
  { role: "Frontend", detail: "knows your 33 components + design tokens", accent: "#BAE6FD" },
  { role: "Backend", detail: "knows your 9 DB models + API contracts", accent: "#A7F3D0" },
  { role: "Security", detail: "knows your auth flows + sensitive routes", accent: "#FDE68A" },
  { role: "Architect", detail: "knows your dependency graph + constraints", accent: "#E9D5FF" },
];

const COMMITS = [
  { sha: "a3f2c1", msg: "feat: add payment webhook handler", time: "just now", highlight: true },
  { sha: "b7d4e8", msg: "hashmark: update agent files", time: "just now", isHashmark: true },
  { sha: "9c1a45", msg: "fix: correct auth middleware order", time: "2h ago", highlight: false },
  { sha: "e5f809", msg: "hashmark: update agent files", time: "2h ago", isHashmark: true },
  { sha: "2d8b3c", msg: "chore: update dependencies", time: "yesterday", highlight: false },
];

function FormatsVisual() {
  return (
    <div className="relative h-64 flex items-center justify-center">
      {FORMAT_FILES.map((f) => (
        <div key={f.file} className="absolute" style={{ left: f.x, top: f.y, transform: "translate(-50%, -50%)" }}>
          <div style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: f.primary ? "13px" : "11px",
            fontWeight: f.primary ? 600 : 400,
            color: f.primary ? "var(--foreground)" : "rgba(26,26,26,0.45)",
            background: f.primary ? "white" : "rgba(255,255,255,0.6)",
            border: `1px solid ${f.primary ? "rgba(147,197,253,0.6)" : "rgba(232,228,217,0.6)"}`,
            borderRadius: "6px",
            padding: f.primary ? "6px 12px" : "4px 10px",
            boxShadow: f.primary ? "0 4px 16px rgba(0,0,0,0.06)" : "none",
            whiteSpace: "nowrap",
          }}>
            {f.file}
          </div>
        </div>
      ))}
      <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.15 }}>
        <line x1="50%" y1="10%" x2="15%" y2="38%" stroke="#BAE6FD" strokeWidth="1" />
        <line x1="50%" y1="10%" x2="75%" y2="30%" stroke="#BAE6FD" strokeWidth="1" />
        <line x1="50%" y1="10%" x2="10%" y2="68%" stroke="#BAE6FD" strokeWidth="1" />
        <line x1="50%" y1="10%" x2="60%" y2="70%" stroke="#BAE6FD" strokeWidth="1" />
        <line x1="50%" y1="10%" x2="82%" y2="60%" stroke="#BAE6FD" strokeWidth="1" />
      </svg>
    </div>
  );
}

function RolesVisual() {
  return (
    <div className="relative h-64 flex flex-col justify-center gap-3">
      {ROLES.map((r) => (
        <div key={r.role} style={{
          display: "flex", alignItems: "center", gap: "12px",
          background: "white", border: "1px solid rgba(232,228,217,0.6)",
          borderRadius: "8px", padding: "10px 16px",
        }}>
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: r.accent, flexShrink: 0 }} />
          <span style={{ fontFamily: "var(--font-montserrat), sans-serif", fontSize: "12px", fontWeight: 600, color: "var(--foreground)", minWidth: "72px" }}>
            {r.role}
          </span>
          <span style={{ fontFamily: "var(--font-crimson), Georgia, serif", fontSize: "14px", fontStyle: "italic", color: "rgba(26,26,26,0.5)" }}>
            {r.detail}
          </span>
        </div>
      ))}
    </div>
  );
}

function CommitsVisual() {
  return (
    <div className="relative h-64 flex flex-col justify-center gap-2">
      {COMMITS.map((c) => (
        <div key={c.sha} style={{
          display: "flex", alignItems: "center", gap: "10px", padding: "7px 12px", borderRadius: "6px",
          background: c.isHashmark ? "rgba(186,230,253,0.12)" : c.highlight ? "rgba(255,255,255,0.9)" : "transparent",
          border: c.highlight ? "1px solid rgba(232,228,217,0.5)" : "1px solid transparent",
        }}>
          <code style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: "11px", color: "rgba(26,26,26,0.3)", flexShrink: 0 }}>
            {c.sha}
          </code>
          <span style={{
            fontFamily: "var(--font-crimson), Georgia, serif", fontSize: "14px",
            fontStyle: c.isHashmark ? "italic" : "normal",
            color: c.isHashmark ? "rgba(147,197,253,0.9)" : "rgba(26,26,26,0.65)",
            flex: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
          }}>
            {c.msg}
          </span>
          <span style={{ fontFamily: "var(--font-montserrat), sans-serif", fontSize: "10px", color: "rgba(26,26,26,0.25)", flexShrink: 0 }}>
            {c.time}
          </span>
        </div>
      ))}
    </div>
  );
}

export const FEATURES = [
  {
    eyebrow: "Formats",
    title: "Every tool speaks a different language.",
    titleItalic: "Hashmark speaks them all.",
    body: "One scan generates seven agent instruction formats simultaneously. AGENTS.md works across 20+ tools. Each format is written for that specific tool's conventions — not a copy-paste.",
    bullets: [
      "AGENTS.md, CLAUDE.md, .cursorrules, copilot-instructions.md",
      "Windsurf, Gemini CLI, and more added continuously",
      "AGENTS.md as the universal fallback for any tool",
    ],
    visual: <FormatsVisual />,
  },
  {
    eyebrow: "Role-aware generation",
    title: "Your frontend agent knows your components.",
    titleItalic: "Your security reviewer knows your auth.",
    body: "We don't generate one big context dump. Each file is written from the perspective of the agent using it — with the specific knowledge that role actually needs.",
    bullets: [
      "Frontend agents get component patterns and design tokens",
      "Backend agents get API contracts and data models",
      "Security reviewers get auth flows and sensitive surface areas",
    ],
    visual: <RolesVisual />,
  },
  {
    eyebrow: "Auto-sync",
    title: "Your agents see today's code.",
    titleItalic: "Not last month's snapshot.",
    body: "Install the GitHub Action once. Every push triggers a new scan and commits updated files. Your AI context is always current — no manual maintenance, no drift.",
    bullets: [
      "GitHub Action commits updated files on every push",
      "Zero config after the initial setup",
      "Works with any branch strategy",
    ],
    visual: <CommitsVisual />,
  },
];
