import {
  HistoryIcon, FilesIcon, IssuesIcon, AgentsIcon, ScanIcon,
  SkillsIcon, WorkflowIcon, TemplatesIcon, UsageIcon,
} from "./ShellIcons";

type Overlay = "files" | "issues" | "agents" | "scan" | "settings" | "terminal" | "history" | "skills" | "usage" | "workflows" | "templates" | null;

const NAV: Array<{ key: NonNullable<Overlay>; icon: React.ReactNode; label: string }> = [
  { key: "history",   icon: <HistoryIcon />,   label: "History" },
  { key: "files",     icon: <FilesIcon />,     label: "Files" },
  { key: "issues",    icon: <IssuesIcon />,    label: "Issues" },
  { key: "agents",    icon: <AgentsIcon />,    label: "Agents" },
  { key: "scan",      icon: <ScanIcon />,      label: "Generate Agents" },
  { key: "skills",    icon: <SkillsIcon />,    label: "Skills" },
  { key: "workflows", icon: <WorkflowIcon />,  label: "Workflows" },
  { key: "templates", icon: <TemplatesIcon />, label: "Templates" },
  { key: "usage",     icon: <UsageIcon />,     label: "Usage" },
];

export function ActivityBar({ overlay, onToggleOverlay }: {
  overlay: Overlay;
  onToggleOverlay: (o: Overlay) => void;
}) {
  return (
    <div className="activity-bar">
      {NAV.map(item => (
        <button
          key={item.key}
          className={`activity-btn${overlay === item.key ? " active" : ""}`}
          title={item.label}
          onClick={() => onToggleOverlay(item.key)}
        >
          {item.icon}
        </button>
      ))}
    </div>
  );
}
