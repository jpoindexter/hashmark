import { useState, useEffect, useRef } from "react";

const GATE_BTN_STYLE: React.CSSProperties = {
  padding: "4px 12px",
  fontSize: 12,
  borderRadius: "var(--radius)",
  cursor: "pointer",
  fontFamily: "var(--font-ui)",
};

export default function PlanReviewGate({ planText }: { planText: string }) {
  const [mode, setMode] = useState<"idle" | "feedback" | "deny">("idle");
  const [feedbackText, setFeedbackText] = useState("");
  const feedbackRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (mode === "feedback" || mode === "deny") {
      requestAnimationFrame(() => feedbackRef.current?.focus());
    }
  }, [mode]);

  const sendMessage = (text: string) => {
    window.dispatchEvent(new CustomEvent("studio:suggest", { detail: { text } }));
    setTimeout(() => {
      const ta = document.querySelector("textarea") as HTMLTextAreaElement | null;
      if (ta) {
        const enterEvent = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
        ta.dispatchEvent(enterEvent);
      }
    }, 50);
  };

  const handleApprove = () => {
    window.dispatchEvent(new CustomEvent("studio:plan-approve"));
    sendMessage(`[APPROVED] Execute the plan above.`);
  };

  const handleDeny = () => {
    if (mode !== "deny") {
      setMode("deny");
      return;
    }
    const reason = feedbackText.trim();
    window.dispatchEvent(new CustomEvent("studio:plan-deny"));
    sendMessage(`[DENIED] ${reason || "Plan rejected. Please propose a different approach."}`);
    setMode("idle");
    setFeedbackText("");
  };

  const handleFeedback = () => {
    if (mode !== "feedback") {
      setMode("feedback");
      return;
    }
    const fb = feedbackText.trim();
    if (!fb) return;
    window.dispatchEvent(new CustomEvent("studio:plan-feedback"));
    sendMessage(`[FEEDBACK] ${fb}`);
    setMode("idle");
    setFeedbackText("");
  };

  const handleFeedbackKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (mode === "feedback") handleFeedback();
      if (mode === "deny") handleDeny();
    }
    if (e.key === "Escape") {
      setMode("idle");
      setFeedbackText("");
    }
  };

  return (
    <div style={{
      padding: "8px 0",
      marginTop: 8,
      borderTop: "1px solid var(--border-dim)",
    }}>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleApprove}
          style={{ ...GATE_BTN_STYLE, fontWeight: 600, background: "var(--accent)", color: "var(--bg)", border: "none" }}
        >
          Approve & Execute
        </button>
        <button
          onClick={handleFeedback}
          style={{
            ...GATE_BTN_STYLE,
            background: mode === "feedback" ? "var(--accent-bg)" : "var(--bg-3)",
            color: mode === "feedback" ? "var(--accent)" : "var(--text-dim)",
            border: mode === "feedback" ? "1px solid var(--accent)" : "1px solid var(--border)",
          }}
        >
          Give Feedback
        </button>
        <button
          onClick={handleDeny}
          style={{
            ...GATE_BTN_STYLE,
            background: mode === "deny" ? "var(--red-bg)" : "none",
            color: "var(--red)",
            border: mode === "deny" ? "1px solid var(--red)" : "1px solid var(--red-bg)",
          }}
        >
          Deny
        </button>
      </div>

      {(mode === "feedback" || mode === "deny") && (
        <div style={{ marginTop: 8 }}>
          <textarea
            ref={feedbackRef}
            value={feedbackText}
            onChange={e => setFeedbackText(e.target.value)}
            onKeyDown={handleFeedbackKeyDown}
            placeholder={mode === "feedback" ? "What should change in this plan?" : "Reason for rejection (optional)..."}
            rows={2}
            style={{
              width: "100%",
              background: "var(--bg-3)",
              border: `1px solid ${mode === "deny" ? "var(--red-bg)" : "var(--border)"}`,
              borderRadius: "var(--radius)",
              color: "var(--text)",
              fontSize: 12,
              fontFamily: "var(--font-ui)",
              padding: "6px 10px",
              resize: "none",
              outline: "none",
            }}
          />
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 4,
          }}>
            <span style={{ fontSize: 10, color: "var(--text-dimmer)", fontFamily: "var(--font-ui)" }}>
              Enter to send, Esc to cancel
            </span>
            <button
              onClick={() => { setMode("idle"); setFeedbackText(""); }}
              style={{
                padding: "2px 8px",
                fontSize: 11,
                background: "none",
                border: "none",
                color: "var(--text-dimmer)",
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
