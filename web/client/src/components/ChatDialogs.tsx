import { getToken } from "../lib/api";
import { toast } from "./Toasts";
import { MultiSelectOptions, AskFreeText } from "./MultiSelectOptions";
import type { Session } from "../types";

interface ChatDialogsProps {
  showCompactConfirm: boolean;
  setShowCompactConfirm: (v: boolean) => void;
  onCompact: () => void;
  broadcastConfirm: { message: string; targets: Session[] } | null;
  setBroadcastConfirm: (v: { message: string; targets: Session[] } | null) => void;
  exitPlanRequest: { plan: string; toolUseId: string } | null;
  denyFeedback: string | null;
  setDenyFeedback: (v: string | null) => void;
  handleExitPlanApprove: () => void;
  handleExitPlanDeny: (feedback?: string) => void;
  askUserQuestion: { question: string; options: string[]; toolUseId: string; multiSelect?: boolean } | null;
  handleAskUserAnswer: (opt: string) => void;
}

export function ChatDialogs({
  showCompactConfirm, setShowCompactConfirm, onCompact,
  broadcastConfirm, setBroadcastConfirm,
  exitPlanRequest, denyFeedback, setDenyFeedback, handleExitPlanApprove, handleExitPlanDeny,
  askUserQuestion, handleAskUserAnswer,
}: ChatDialogsProps) {
  return (
    <>
      {showCompactConfirm && (
        <div style={{
          background: "var(--bg-elevated)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)", padding: 14, margin: "8px 0",
          animation: "gc-fade-in 0.2s both", display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 600 }}>Compact context?</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>Summarizes prior messages to free up context. Cannot be undone.</div>
          </div>
          <button className="btn" style={{ fontSize: 11, padding: "4px 12px" }} onClick={() => { setShowCompactConfirm(false); onCompact(); }}>Compact</button>
          <button className="btn" style={{ fontSize: 11, padding: "4px 12px" }} onClick={() => setShowCompactConfirm(false)}>Cancel</button>
        </div>
      )}

      {broadcastConfirm && (
        <div style={{
          background: "var(--bg-elevated)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)", padding: 14, margin: "8px 0",
          animation: "gc-fade-in 0.2s both",
        }}>
          <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 600, marginBottom: 4 }}>
            Broadcast to {broadcastConfirm.targets.length} session{broadcastConfirm.targets.length !== 1 ? "s" : ""}?
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginBottom: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            "{broadcastConfirm.message}"
          </div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 10 }}>
            {broadcastConfirm.targets.map(t => t.title).join(", ")}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-primary" style={{ fontSize: 11, padding: "4px 12px" }} onClick={async () => {
              const { message: msg, targets } = broadcastConfirm;
              setBroadcastConfirm(null);
              const token = await getToken();
              await Promise.allSettled(targets.map(t =>
                fetch(`/api/sessions/${t.id}/chat`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
                  body: JSON.stringify({ message: msg }),
                })
              ));
              toast.success(`Broadcast sent to ${targets.length} session${targets.length !== 1 ? "s" : ""}`);
            }}>Send</button>
            <button className="btn" style={{ fontSize: 11, padding: "4px 12px" }} onClick={() => setBroadcastConfirm(null)}>Cancel</button>
          </div>
        </div>
      )}

      {exitPlanRequest && (
        <div style={{
          background: "var(--bg-elevated)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)", padding: 16, margin: "8px 0",
          animation: "gc-fade-in 0.3s both",
        }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
            Claude wants to exit plan mode and execute
          </div>
          {exitPlanRequest.plan && (
            <pre style={{ fontSize: 11, color: "var(--text-dim)", whiteSpace: "pre-wrap", wordBreak: "break-word", margin: "0 0 12px", fontFamily: "var(--font-mono)", lineHeight: 1.5 }}>
              {exitPlanRequest.plan}
            </pre>
          )}
          {denyFeedback !== null ? (
            <div>
              <textarea
                autoFocus
                value={denyFeedback}
                onChange={e => setDenyFeedback(e.target.value)}
                placeholder="Optional feedback for Claude..."
                rows={2}
                style={{
                  width: "100%", resize: "vertical", background: "var(--bg)",
                  border: "1px solid var(--border-focus)", borderRadius: "var(--radius-sm)",
                  padding: "6px 8px", fontSize: 12, color: "var(--text)",
                  lineHeight: 1.5, boxSizing: "border-box", marginBottom: 8,
                }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => handleExitPlanDeny(denyFeedback || undefined)}
                  style={{ padding: "5px 14px", fontSize: 12, background: "var(--red)", color: "var(--text-on-accent)", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 600 }}
                >Send Feedback</button>
                <button
                  onClick={() => setDenyFeedback(null)}
                  style={{ padding: "5px 12px", fontSize: 12, background: "none", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer" }}
                >Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => void handleExitPlanApprove()}
                style={{ padding: "5px 14px", fontSize: 12, background: "var(--accent)", color: "var(--text-on-accent)", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 600 }}
              >Approve (⌘↵)</button>
              <button
                onClick={() => setDenyFeedback("")}
                style={{ padding: "5px 12px", fontSize: 12, background: "none", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer" }}
              >Deny</button>
            </div>
          )}
        </div>
      )}

      {askUserQuestion && (
        <div style={{
          background: "var(--bg-elevated)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)", padding: 16, margin: "8px 0",
          animation: "gc-fade-in 0.3s both",
        }}>
          <div style={{ fontSize: 13, color: "var(--text)", marginBottom: 12, fontWeight: 500 }}>
            {askUserQuestion.question}
          </div>
          {askUserQuestion.options.length > 0 ? (
            askUserQuestion.multiSelect
              ? <MultiSelectOptions options={askUserQuestion.options} onSubmit={handleAskUserAnswer} />
              : askUserQuestion.options.map((opt, i) => (
                <button key={i} onClick={() => handleAskUserAnswer(opt)} style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "8px 12px", marginBottom: 4, fontSize: 12,
                  background: "var(--bg)", border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)", cursor: "pointer", color: "var(--text-dim)",
                  transition: "background var(--transition), color var(--transition)",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "var(--bg)"; e.currentTarget.style.color = "var(--text-dim)"; }}
                >
                  <span style={{ color: "var(--text-muted)", marginRight: 8 }}>{i + 1}.</span>{opt}
                </button>
              ))
          ) : (
            <AskFreeText onSubmit={handleAskUserAnswer} />
          )}
        </div>
      )}
    </>
  );
}
