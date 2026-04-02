import { useState, useEffect, useCallback, useRef } from "react";
import { Shield } from "lucide-react";
import { Skeleton, SkeletonCard } from "../../components/shared/Skeleton";
import Toggle from "../../components/shared/Toggle";
import { fetchApi } from "../../lib/api";
import type { Policy } from "./types";
import { PolicyDrawer } from "./PolicyDrawer";

function OutcomeBadge({ outcome }: { outcome: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    allowed: { bg: "var(--accent-bg)", color: "var(--accent)" },
    blocked: { bg: "var(--red-bg)",  color: "var(--red)" },
    flagged: { bg: "var(--yellow-bg)",   color: "var(--yellow)" },
  };
  const s = map[outcome] ?? { bg: "rgba(113,113,122,0.15)", color: "var(--text-dim)" };
  return (
    <span style={{
      display: "inline-block",
      padding: "1px 7px",
      fontSize: 10,
      fontFamily: "var(--font)",
      fontWeight: 600,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      background: s.bg,
      color: s.color,
      borderRadius: 2,
    }}>
      {outcome}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "1px 7px",
      fontSize: 10,
      fontFamily: "var(--font)",
      letterSpacing: "0.04em",
      background: "rgba(113,113,122,0.15)",
      color: "var(--text-dim)",
      borderRadius: 2,
    }}>
      {type}
    </span>
  );
}

function DeleteButton({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen(v => !v)}
        title="Delete policy"
        style={{
          background: "none", border: "none",
          color: open ? "var(--red)" : "var(--text-dimmer)",
          cursor: "pointer", fontSize: 15, lineHeight: 1,
          transition: "color 0.1s", padding: "0 2px",
        }}
        className={open ? "" : "hoverable"}
      >
        ×
      </button>
      {open && (
        <div style={{
          position: "absolute",
          right: 0,
          top: "calc(100% + 4px)",
          background: "var(--bg-3)",
          border: "1px solid var(--border)",
          borderTop: "2px solid var(--red)",
          padding: "10px 12px",
          whiteSpace: "nowrap",
          zIndex: 100,
          minWidth: 160,
        }}>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 8 }}>Delete this policy?</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => { setOpen(false); onConfirm(); }}
              style={{
                background: "var(--red)", border: "none", color: "var(--text)",
                padding: "3px 10px", fontFamily: "var(--font)", fontSize: 10,
                fontWeight: 600, cursor: "pointer", letterSpacing: "0.04em",
              }}
            >
              DELETE
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none", border: "1px solid var(--border-dim)",
                color: "var(--text-dim)", padding: "3px 10px",
                fontFamily: "var(--font)", fontSize: 10, cursor: "pointer",
              }}
            >
              CANCEL
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export { OutcomeBadge, TypeBadge };

export function PoliciesTab() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerPolicy, setDrawerPolicy] = useState<Policy | null | "new">(undefined as unknown as Policy | null | "new");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchApi("/api/governance/policies")
      .then(r => r.json())
      .then((d: { policies: Policy[] }) => setPolicies(d.policies))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setDrawerPolicy(null);
    setDrawerOpen(true);
  };

  const openEdit = (p: Policy) => {
    setDrawerPolicy(p);
    setDrawerOpen(true);
  };

  const closeDrawer = () => setDrawerOpen(false);

  const toggleEnabled = async (p: Policy) => {
    setTogglingId(p.id);
    await fetchApi(`/api/governance/policies/${p.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: p.enabled === 0 }),
    });
    setTogglingId(null);
    load();
  };

  const deletePolicy = async (id: string) => {
    await fetchApi(`/api/governance/policies/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: "var(--text-dimmer)", letterSpacing: "0.04em" }}>
          {policies.length} {policies.length === 1 ? "policy" : "policies"}
        </span>
        <button
          onClick={openCreate}
          style={{
            background: "none",
            border: "1px solid var(--border)",
            color: "var(--text-dim)",
            padding: "4px 12px",
            fontFamily: "var(--font)", fontSize: 11,
            cursor: "pointer", letterSpacing: "0.04em",
          }}
        >
          + NEW POLICY
        </button>
      </div>

      {loading ? (
        <div style={{ border: "1px solid var(--border-dim)", overflow: "hidden" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 90px 70px 48px 60px 80px 48px",
            padding: "6px 10px", background: "var(--bg-3)",
            borderBottom: "1px solid var(--border-dim)",
          }}>
            <Skeleton width={30} height={8} />
          </div>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "1fr 90px 70px 48px 60px 80px 48px",
              alignItems: "center", padding: "10px 10px", gap: 8,
              borderBottom: i < 2 ? "1px solid var(--border-dim)" : "none",
            }}>
              <div>
                <Skeleton height={11} width={`${50 + i * 20}%`} style={{ marginBottom: 5 }} />
                <Skeleton height={9} width="70%" />
              </div>
              <Skeleton height={10} width={55} />
              <Skeleton height={10} width={20} />
              <SkeletonCard width={32} height={18} />
              <SkeletonCard width={40} height={22} />
              <SkeletonCard width={60} height={22} />
              <Skeleton height={10} width={14} />
            </div>
          ))}
        </div>
      ) : policies.length === 0 ? (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", padding: "48px 20px", gap: 12,
        }}>
          <Shield size={32} style={{ color: "var(--text-dimmer)", opacity: 0.5 }} />
          <div style={{
            fontSize: 13, fontWeight: 600, color: "var(--text-dim)",
            fontFamily: "var(--font-ui)", letterSpacing: "0.02em",
          }}>
            No policies yet
          </div>
          <div style={{
            fontSize: 11, color: "var(--text-dimmer)", textAlign: "center",
            fontFamily: "var(--font-ui)", maxWidth: 340, lineHeight: 1.5,
          }}>
            Policies define rules that govern agent behavior -- block dangerous actions, require tests before merge, or flag risky patterns for review.
          </div>
          <button
            onClick={openCreate}
            style={{
              marginTop: 4,
              padding: "6px 16px",
              background: "none",
              border: "1px solid var(--border)",
              color: "var(--text-dim)",
              fontFamily: "var(--font)",
              fontSize: 11,
              cursor: "pointer",
              letterSpacing: "0.04em",
              transition: "border-color 0.1s, color 0.1s",
            }}
            className="hoverable"
          >
            + NEW POLICY
          </button>
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-dim)" }}>
              {["NAME", "SCOPE", "RULES", "ENABLED", "", "", ""].map((h, i) => (
                <th key={i} style={{
                  padding: "6px 10px", textAlign: "left",
                  fontSize: 10, letterSpacing: "0.06em",
                  color: "var(--text-dimmer)", fontWeight: 600,
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {policies.map(p => (
              <tr
                key={p.id}
                className="hoverable"
                style={{ borderBottom: "1px solid var(--border-dim)" }}
              >
                <td style={{ padding: "8px 10px" }}>
                  <div style={{ color: "var(--text)", fontWeight: 600 }}>{p.name}</div>
                  {p.description && (
                    <div style={{ fontSize: 11, color: "var(--text-dimmer)", marginTop: 2 }}>{p.description}</div>
                  )}
                </td>
                <td style={{ padding: "8px 10px", color: "var(--text-dim)", fontFamily: "var(--font)", fontSize: 11 }}>
                  {p.scope}
                </td>
                <td style={{ padding: "8px 10px", color: "var(--text-dim)" }}>
                  {p.rules.length}
                </td>
                <td style={{ padding: "8px 10px" }}>
                  <Toggle
                    checked={Boolean(p.enabled)}
                    onChange={() => void toggleEnabled(p)}
                    disabled={togglingId === p.id}
                  />
                </td>
                <td style={{ padding: "8px 6px" }}>
                  <button
                    onClick={() => openEdit(p)}
                    style={{
                      background: "none", border: "1px solid var(--border-dim)",
                      color: "var(--text-dim)", padding: "3px 8px",
                      fontFamily: "var(--font)", fontSize: 10,
                      cursor: "pointer", letterSpacing: "0.04em",
                      whiteSpace: "nowrap",
                    }}
                    className="hoverable"
                  >
                    EDIT
                  </button>
                </td>
                <td style={{ padding: "8px 6px" }}>
                  <DeleteButton onConfirm={() => void deletePolicy(p.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {drawerOpen && (
        <PolicyDrawer
          policy={drawerPolicy as Policy | null}
          onSave={() => { closeDrawer(); load(); }}
          onClose={closeDrawer}
        />
      )}
    </div>
  );
}
