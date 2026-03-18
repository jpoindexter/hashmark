export const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "",
    description: "For open-source maintainers and solo devs.",
    features: [
      "1 connected repository",
      "Manual scan via web UI",
      "All 8 output formats",
      "Basic intelligence dashboard",
    ],
    cta: "Get started",
    href: "/login?plan=free",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$19",
    period: "/mo",
    description: "For individuals who ship fast.",
    features: [
      "Unlimited repositories",
      "Auto-sync via GitHub Action",
      "Full codebase intelligence dashboard",
      "Custom rules engine",
      "Scan history with diffs",
    ],
    cta: "Start free trial",
    href: "/login?plan=pro",
    highlighted: true,
  },
  {
    name: "Team",
    price: "$29",
    period: "/seat/mo",
    description: "For teams building at scale.",
    features: [
      "Everything in Pro",
      "Org-wide rules across all repos",
      "Shared custom rules library",
      "Invite team members",
      "Priority support",
    ],
    cta: "Contact us",
    href: "mailto:hello@theft.studio",
    highlighted: false,
  },
];

export const FEATURE_ROWS = [
  { name: "Connected repositories", free: "1", pro: "Unlimited", team: "Unlimited" },
  { name: "Manual scan via web UI", free: true, pro: true, team: true },
  { name: "All 8 output formats", free: true, pro: true, team: true },
  { name: "Auto-sync via GitHub Action", free: false, pro: true, team: true },
  { name: "Intelligence dashboard", free: "Basic", pro: "Full", team: "Full" },
  { name: "Custom rules", free: false, pro: true, team: true },
  { name: "Scan history + diffs", free: false, pro: true, team: true },
  { name: "Org-wide rules", free: false, pro: false, team: true },
  { name: "Invite team members", free: false, pro: false, team: true },
  { name: "Priority support", free: false, pro: false, team: true },
] as const;

export const FAQ_ITEMS = [
  {
    q: "What happens when I hit my repo limit?",
    a: "On Free you can connect 1 repository. Upgrade to Pro for unlimited repos. Your existing data is preserved.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel from your billing dashboard anytime. You keep access until the end of your billing period. No lock-in.",
  },
  {
    q: "Do you store my source code?",
    a: "No. We clone your repo to a temporary directory, run the scanner, generate context files, then immediately delete the clone. Only scan results and generated files are stored.",
  },
  {
    q: "Which AI tools are supported?",
    a: "Hashmark generates 8 formats: AGENTS.md, CLAUDE.md, .cursorrules, .cursor/rules/*.mdc, copilot-instructions.md, .windsurfrules, GEMINI.md, and .clinerules.",
  },
  {
    q: "How does auto-sync work?",
    a: "Pro and Team plans include a GitHub Action that runs on every push to your default branch, auto-committing updated context files. Zero maintenance.",
  },
];

export function CheckIcon({ inverted }: { inverted?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
      <circle cx="7" cy="7" r="7" fill={inverted ? "rgba(253,252,249,0.12)" : "rgba(26,26,26,0.08)"} />
      <path d="M4 7l2 2 4-4" stroke={inverted ? "var(--background)" : "var(--foreground)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FeatureCell({ value }: { value: boolean | string }) {
  if (typeof value === "string") {
    return (
      <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "12px", color: "var(--foreground)" }}>
        {value}
      </span>
    );
  }
  if (value) {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ margin: "0 auto", display: "block" }}>
        <path d="M3 8l3.5 3.5 6.5-7" stroke="var(--foreground)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <span style={{ color: "rgba(26,26,26,0.2)", display: "block", textAlign: "center", fontSize: "12px" }}>—</span>
  );
}
