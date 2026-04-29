import { useState, useEffect } from "react";
import { fetchApi } from "../lib/api";
import { toast } from "./Toasts";

interface Skill {
  id: string;
  name: string;
  description: string;
}

interface SkillDetail extends Skill {
  content: string;
}

export function SkillsPanel({ onInject }: { onInject: (skill: { id: string; name: string; content: string }) => void }) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    fetchApi<{ skills: Skill[] }>("/api/skills")
      .then(d => setSkills(d.skills))
      .catch(() => toast.error("Failed to load skills"))
      .finally(() => setLoading(false));
  }, []);

  const toggleExpand = async (id: string) => {
    if (expanded === id) {
      setExpanded(null);
      setDetail(null);
      return;
    }
    setExpanded(id);
    setDetail(null);
    setLoadingDetail(true);
    try {
      const d = await fetchApi<SkillDetail>(`/api/skills/${id}`);
      setDetail(d);
    } catch {
      toast.error("Failed to load skill");
    } finally {
      setLoadingDetail(false);
    }
  };

  const filtered = search.trim()
    ? skills.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.description.toLowerCase().includes(search.toLowerCase()))
    : skills;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search skills..."
          autoFocus
          style={{
            width: "100%", background: "var(--bg)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)", padding: "6px 10px", fontSize: 12,
            color: "var(--text)", outline: "none", boxSizing: "border-box",
          }}
          onFocus={e => (e.currentTarget.style.borderColor = "var(--border-focus)")}
          onBlur={e => (e.currentTarget.style.borderColor = "var(--border)")}
        />
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        {loading && (
          <div style={{ padding: 16, fontSize: 12, color: "var(--text-muted)" }}>Loading...</div>
        )}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: 16, fontSize: 12, color: "var(--text-muted)" }}>
            {skills.length === 0 ? "No skills found in ~/.claude/skills/" : "No skills match your search"}
          </div>
        )}
        {filtered.map(skill => (
          <div key={skill.id} style={{ borderBottom: "1px solid var(--border)" }}>
            <div
              onClick={() => void toggleExpand(skill.id)}
              style={{
                padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 10,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 1, flexShrink: 0, width: 12 }}>
                {expanded === skill.id ? "▾" : "▸"}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", fontFamily: "var(--font-sans)" }}>{skill.name}</div>
                {skill.description && (
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.4, fontFamily: "var(--font-sans)" }}>{skill.description}</div>
                )}
              </div>
            </div>

            {expanded === skill.id && (
              <div style={{ padding: "0 14px 12px 36px" }}>
                {loadingDetail && !detail && (
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Loading...</div>
                )}
                {detail && detail.id === skill.id && (
                  <>
                    <pre style={{
                      background: "var(--bg)", border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)", padding: "8px 10px",
                      fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5,
                      overflow: "auto", maxHeight: 240, whiteSpace: "pre-wrap",
                      wordBreak: "break-word", fontFamily: "var(--font-mono)",
                      margin: 0,
                    }}>
                      {detail.content}
                    </pre>
                    <button
                      onClick={() => onInject({ id: detail.id, name: detail.name, content: detail.content })}
                      style={{
                        marginTop: 8, padding: "4px 12px", fontSize: 11,
                        background: "var(--accent)", color: "var(--text-on-accent)", border: "none",
                        borderRadius: "var(--radius-sm)", cursor: "pointer", fontWeight: 600,
                      }}
                    >
                      Inject into chat
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
