import { Zap } from "lucide-react";
import type { RunResult } from "./types";

interface RunDoneBannerProps {
  result: RunResult;
  error: string | null;
  copied: boolean;
  merging: boolean;
  diffLoading: boolean;
  onExecutePlan: () => void;
  onMerge: () => void;
  onViewDiff: () => void;
  onRunAgain: () => void;
  onShare: () => void;
  onReset: () => void;
}

export default function RunDoneBanner({
  result, error, copied, merging, diffLoading,
  onExecutePlan, onMerge, onViewDiff, onRunAgain, onShare, onReset,
}: RunDoneBannerProps) {
  if (error) return null;

  const borderColor = result.mode === "plan"
    ? "var(--cyan)"
    : result.conflictBranch
      ? "var(--yellow)"
      : result.readyToMerge && !result.merged
        ? "var(--yellow)"
        : result.merged || result.hasChanges
          ? "var(--accent)"
          : "var(--border-dim)";

  const dotColor = result.mode === "plan"
    ? "var(--cyan)"
    : result.conflictBranch
      ? "var(--yellow)"
      : result.hasChanges
        ? "var(--accent)"
        : "var(--border-dim)";

  const textColor = result.mode === "plan"
    ? "var(--cyan)"
    : result.conflictBranch
      ? "var(--yellow)"
      : result.hasChanges
        ? "var(--accent)"
        : "var(--text-dimmer)";

  const statusText = result.mode === "plan"
    ? "Plan complete — review output above"
    : result.conflictBranch
      ? `Merge conflict — branch ${result.conflictBranch} preserved`
      : result.merged
        ? "Merged to main"
        : result.readyToMerge
          ? `Ready to merge — ${result.readyToMerge.filesChanged} file${result.readyToMerge.filesChanged !== 1 ? "s" : ""} changed`
          : result.hasChanges
            ? `Changes on ${result.readyToMerge ? result.readyToMerge.branch : "branch"}`
            : "No changes made";

  return (
    <div style={{
      padding: "14px 16px",
      background: "var(--bg-2)",
      border: `1px solid ${borderColor}`,
      borderRadius: "var(--radius)",
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
          background: dotColor,
        }} />
        <span style={{ fontSize: 12, color: textColor, flex: 1 }}>
          {statusText}
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {result.mode === "plan" && (
          <button
            className="btn btn-primary btn-sm"
            onClick={onExecutePlan}
            style={{ display: "flex", alignItems: "center", gap: 5 }}
          >
            <Zap size={12} />
            execute this plan
          </button>
        )}
        {result.readyToMerge && !result.merged && (
          <button
            className="btn btn-primary btn-sm"
            onClick={onMerge}
            disabled={merging}
            style={{ borderColor: "var(--yellow)", color: "var(--yellow)" }}
          >
            {merging ? "merging..." : `review & merge (${result.readyToMerge.filesChanged} file${result.readyToMerge.filesChanged !== 1 ? "s" : ""})`}
          </button>
        )}
        {result.hasChanges && result.mode !== "plan" && (
          <button
            className="btn btn-sm"
            onClick={onViewDiff}
            disabled={diffLoading}
          >
            {diffLoading ? "loading..." : "view diff"}
          </button>
        )}
        <button className="btn btn-sm" onClick={onRunAgain}>
          {"run again"}
        </button>
        <button
          className="btn btn-sm"
          onClick={onShare}
          style={{ color: copied ? "var(--accent)" : undefined, borderColor: copied ? "var(--accent)" : undefined }}
        >
          {copied ? "copied!" : "share"}
        </button>
        <span style={{ flex: 1 }} />
        <button className="btn btn-sm" onClick={onReset}>
          {"new run"}
        </button>
      </div>
    </div>
  );
}
