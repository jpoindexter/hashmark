import { useState } from "react";
import { Shield } from "lucide-react";
import { PageShell } from "../components/shared/PageShell.tsx";
import { PoliciesTab } from "./governance/PoliciesTab";
import { ActionLogTab } from "./governance/ActionLogTab";
import { ActionJournalTab } from "./governance/ActionJournalTab";

type Tab = "policies" | "actions" | "journal";

export default function Governance() {
  const [tab, setTab] = useState<Tab>("policies");

  const tabStyle = (active: boolean): React.CSSProperties => ({
    background: "none",
    border: "none",
    borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
    color: active ? "var(--text)" : "var(--text-dimmer)",
    padding: "8px 16px",
    fontFamily: "var(--font)",
    fontSize: 11,
    letterSpacing: "0.06em",
    cursor: "pointer",
    transition: "color 0.1s",
  });

  return (
    <PageShell maxWidth={1100}>
    <div style={{ fontFamily: "var(--font-ui)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <Shield size={16} style={{ color: "var(--accent)" }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", letterSpacing: "0.02em" }}>
          GOVERNANCE
        </span>
        <span style={{ fontSize: 11, color: "var(--text-dimmer)", marginLeft: 4 }}>
          Policy engine + action log
        </span>
      </div>

      <div style={{
        display: "flex",
        borderBottom: "1px solid var(--border-dim)",
        marginBottom: 20,
      }}>
        <button style={tabStyle(tab === "policies")} onClick={() => setTab("policies")}>
          POLICIES
        </button>
        <button style={tabStyle(tab === "actions")} onClick={() => setTab("actions")}>
          ACTION LOG
        </button>
        <button style={tabStyle(tab === "journal")} onClick={() => setTab("journal")}>
          ACTION LOG (JSONL)
        </button>
      </div>

      {tab === "policies" ? <PoliciesTab /> : tab === "actions" ? <ActionLogTab /> : <ActionJournalTab />}
    </div>
    </PageShell>
  );
}
