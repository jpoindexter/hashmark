import type { Session } from "../types";
import { getContextLimit, getSessionCost } from "../lib/modelConfig";

interface ChatPaneHeaderProps {
  session: Session;
  lastTurnTokens: number | null;
  budgetEditing: boolean;
  budgetDraft: string;
  setBudgetEditing: (v: boolean) => void;
  setBudgetDraft: (v: string) => void;
  patchSession: (updates: Partial<Session>) => Promise<void>;
}

export function ChatPaneHeader({
  session, lastTurnTokens,
  budgetEditing, budgetDraft, setBudgetEditing, setBudgetDraft,
  patchSession,
}: ChatPaneHeaderProps) {
  const contextLimit = getContextLimit(session.model);
  const totalTokens = (session.input_tokens ?? 0) + (session.output_tokens ?? 0);
  const contextPct = Math.min(100, (totalTokens / contextLimit) * 100);
  const barColor = contextPct > 80 ? "var(--red)" : contextPct > 50 ? "var(--orange)" : "var(--accent)";
  const sessionCost = getSessionCost(session.model, session.input_tokens ?? 0, session.output_tokens ?? 0);

  return (
    <div style={{
      height: 38, display: "flex", alignItems: "center", padding: "0 16px",
      borderBottom: "1px solid var(--border)", flexShrink: 0, gap: 10,
      background: "var(--bg-panel)",
    }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {session.title}
      </span>

      {(session.input_tokens ?? 0) > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <div style={{ width: 48, height: 3, background: "var(--bg-active)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 2, width: `${contextPct}%`, background: barColor, transition: "width 0.3s ease" }} />
          </div>
          {contextPct > 50 ? (
            <span style={{ fontSize: 10, color: barColor }}>{Math.round(contextPct)}%</span>
          ) : (
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
              {(totalTokens / 1000).toFixed(1)}k
            </span>
          )}
        </div>
      )}

      {sessionCost >= 0.001 && (
        <span
          style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)", flexShrink: 0 }}
          title={`Estimated cost: $${sessionCost.toFixed(4)}`}
        >
          {sessionCost < 0.01 ? `<$0.01` : sessionCost < 1 ? `$${sessionCost.toFixed(3)}` : `$${sessionCost.toFixed(2)}`}
        </span>
      )}

      {budgetEditing ? (
        <input
          autoFocus
          className="input input-mono"
          style={{ width: 72, fontSize: 11, padding: "2px 6px", height: 22, flexShrink: 0 }}
          value={budgetDraft}
          placeholder="k tokens"
          onChange={e => setBudgetDraft(e.target.value.replace(/[^\d]/g, ""))}
          onBlur={async () => {
            setBudgetEditing(false);
            const k = parseInt(budgetDraft, 10);
            const val = isNaN(k) || k === 0 ? null : k * 1000;
            await patchSession({ token_budget: val });
          }}
          onKeyDown={e => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") { setBudgetEditing(false); setBudgetDraft(""); }
          }}
        />
      ) : (
        <button
          title={session.token_budget
            ? `Token budget: ${Math.round(session.token_budget / 1000)}k per turn${lastTurnTokens ? ` · last turn used ${Math.round(lastTurnTokens / 1000)}k` : ""}`
            : "Set token budget (k tokens per turn)"}
          onClick={() => {
            setBudgetEditing(true);
            setBudgetDraft(session.token_budget ? String(Math.round(session.token_budget / 1000)) : "");
          }}
          style={{
            background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
            color: session.token_budget
              ? (lastTurnTokens && session.token_budget && lastTurnTokens >= session.token_budget * 0.8 ? "var(--orange)" : "var(--text-muted)")
              : "var(--text-muted)",
            fontSize: 10, padding: "0 7px", cursor: "pointer", flexShrink: 0, height: 20,
            fontFamily: "var(--font-mono)",
          }}
        >
          {session.token_budget
            ? (lastTurnTokens
                ? `${Math.round(lastTurnTokens / 1000)}k / ${Math.round(session.token_budget / 1000)}k`
                : `${Math.round(session.token_budget / 1000)}k lim`)
            : "no limit"}
        </button>
      )}

      {session.status === "running" && (
        <span style={{
          width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
          background: "var(--accent)", boxShadow: "0 0 0 2px var(--accent-dim)",
          animation: "dot-pulse 1.4s ease-in-out infinite",
        }} />
      )}
    </div>
  );
}
