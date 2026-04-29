import { useState, useRef, useCallback } from "react";
import { fetchApi, getToken } from "../lib/api";
import { toast } from "../components/Toasts";
import type { Session, Message, Block } from "../types";
import type { FileEdit } from "../components/DiffPane";

export interface LiveTool {
  toolUseId: string;
  name: string;
  input?: Record<string, unknown>;
  result?: string;
  isError?: boolean;
  pending?: boolean;
}

interface StreamEvent {
  type: "text" | "thinking" | "tool_use" | "tool_result" | "tool_approval" | "error" | "done" | "budget_exceeded" | "compaction" | "plan_update" | "new_session" | string;
  text?: string;
  content?: string;
  summary?: string;
  tool?: string;
  input?: Record<string, unknown>;
  toolUseId?: string;
  isError?: boolean;
  error?: string;
  title?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  tokensUsed?: number;
  budget?: number;
  tasks?: Array<{ id: string; title: string; done: boolean }>;
  sessionId?: string;
}

interface UseChatStreamOpts {
  session: Session;
  onSessionUpdate: (updates: Partial<Session>) => void;
  patchSession: (updates: Partial<Session>) => Promise<void>;
  getSkillChips: () => Array<{ id: string; name: string; content: string }>;
  clearSkillChips: () => void;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  onDispatch?: (sessions: Session[]) => void;
}

export function useChatStream({
  session, onSessionUpdate, patchSession,
  getSkillChips, clearSkillChips, setMessages, onDispatch,
}: UseChatStreamOpts) {
  const [streaming, setStreaming] = useState(false);
  const streamingRef = useRef(false);
  const [liveText, setLiveText] = useState("");
  const [liveTools, setLiveTools] = useState<LiveTool[]>([]);
  const [toolsElapsed, setToolsElapsed] = useState<number | null>(null);
  const toolsStartRef = useRef<number | null>(null);
  const [textActive, setTextActive] = useState(false);
  const textActiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [lastTurnTokens, setLastTurnTokens] = useState<number | null>(null);
  const [plan, setPlan] = useState<Array<{ id: string; title: string; done: boolean }>>([]);
  const [askUserQuestion, setAskUserQuestion] = useState<{ question: string; options: string[]; toolUseId: string; multiSelect?: boolean } | null>(null);
  const [exitPlanRequest, setExitPlanRequest] = useState<{ plan: string; toolUseId: string } | null>(null);
  const [denyFeedback, setDenyFeedback] = useState<string | null>(null);
  const [turnFiles, setTurnFiles] = useState<Array<{ path: string; op: string }>>([]);
  const [fileEdits, setFileEdits] = useState<FileEdit[]>([]);

  const stopStream = useCallback(() => {
    setStreaming(false);
    streamingRef.current = false;
    onSessionUpdate({ status: "idle" });
    fetchApi(`/api/sessions/${session.id}/cancel`, { method: "POST" }).catch(() => {});
  }, [session.id, onSessionUpdate]);

  const handleApproval = useCallback(async (toolUseId: string, approved: boolean) => {
    try {
      await fetchApi(`/api/sessions/${session.id}/approve`, {
        method: "POST",
        body: JSON.stringify({ toolUseId, approved }),
      });
    } catch {
      toast.error("Failed to send approval");
    }
  }, [session.id]);

  const send = useCallback(async (text: string) => {
    const chips = getSkillChips();
    const skillPrefix = chips.map(s => `<skill name="${s.name}">\n${s.content}\n</skill>`).join("\n\n");
    const raw = text.trim();

    if (raw.startsWith("!")) {
      const command = raw.slice(1).trim();
      clearSkillChips();
      try {
        const res = await fetchApi<{ output: string; error?: string }>(`/api/sessions/${session.id}/shell`, {
          method: "POST",
          body: JSON.stringify({ command }),
        });
        const shellId = `shell-${Date.now()}`;
        setMessages(prev => [...prev, {
          id: shellId, role: "assistant" as const, content: "",
          blocks: [
            { type: "tool_use" as Block["type"], name: "bash", input: { command }, id: shellId },
            { type: "tool_result" as Block["type"], content: res.output || res.error || "", isError: !!res.error },
          ],
          created_at: Date.now(),
        }]);
      } catch (err) {
        if (err instanceof Error) toast.error(err.message);
      }
      return;
    }

    // Resolve @artifact references
    const artifactMatches = [...raw.matchAll(/@artifact:([a-f0-9-]{8,})/g)];
    let resolvedRaw = raw;
    if (artifactMatches.length > 0) {
      const token = await getToken();
      for (const match of artifactMatches) {
        try {
          const res = await fetch(`/api/artifacts/${match[1]}/output`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (res.ok) {
            const content = await res.text();
            resolvedRaw = resolvedRaw.replace(match[0], `\n<artifact session="${match[1]}">\n${content}\n</artifact>\n`);
          }
        } catch {}
      }
    }

    // /parallel N <message>
    const parallelMatch = /^\/parallel\s+(\d+)\s+([\s\S]+)$/i.exec(resolvedRaw);
    if (parallelMatch && onDispatch) {
      const count = Math.min(Math.max(1, parseInt(parallelMatch[1], 10)), 8);
      const message = skillPrefix ? `${skillPrefix}\n\n${parallelMatch[2]}` : parallelMatch[2];
      clearSkillChips();
      try {
        const { sessions: newSessions } = await fetchApi<{ sessions: Session[]; count: number }>(
          "/api/sessions/dispatch", { method: "POST", body: JSON.stringify({ message, count }) }
        );
        onDispatch(newSessions);
        toast.success(`Dispatched to ${count} sessions`);
      } catch { toast.error("Dispatch failed"); }
      return;
    }

    const msg = skillPrefix ? `${skillPrefix}\n\n${resolvedRaw}` : resolvedRaw;
    if (!msg || streaming) return;
    clearSkillChips();

    setStreaming(true);
    streamingRef.current = true;
    setLiveText("");
    setLiveTools([]);
    setToolsElapsed(null);
    setTurnFiles([]);
    setFileEdits([]);
    toolsStartRef.current = null;
    onSessionUpdate({ status: "running" });

    const optimistic: Message = { id: `opt_${Date.now()}`, role: "user", content: msg, created_at: Date.now() };
    setMessages(prev => [...prev, optimistic]);

    let textAccum = "";
    const toolMap = new Map<string, LiveTool>();

    const handleEvent = (evt: StreamEvent) => {
      if (evt.type === "text" && evt.text) {
        if (toolsStartRef.current && toolMap.size > 0) setToolsElapsed(Date.now() - toolsStartRef.current);
        textAccum += evt.text;
        setLiveText(textAccum);
        setTextActive(true);
        if (textActiveTimerRef.current) clearTimeout(textActiveTimerRef.current);
        textActiveTimerRef.current = setTimeout(() => setTextActive(false), 600);
      } else if (evt.type === "tool_use" && evt.toolUseId) {
        if (evt.tool === "ExitPlanMode") {
          setExitPlanRequest({ plan: String((evt.input as Record<string, unknown>)?.plan ?? ""), toolUseId: evt.toolUseId });
          return;
        }
        if (evt.tool === "AskUserQuestion") {
          const inp = (evt.input ?? {}) as Record<string, unknown>;
          setAskUserQuestion({
            question: String(inp.question ?? ""),
            options: Array.isArray(inp.options) ? (inp.options as unknown[]).map(String) : [],
            toolUseId: evt.toolUseId,
            multiSelect: Boolean(inp.multiSelect ?? inp.multi_select ?? false),
          });
          return;
        }
        if (!toolsStartRef.current) toolsStartRef.current = Date.now();
        if (evt.tool === "write" && evt.input?.file_path) {
          setTurnFiles(prev => [...prev, { path: String(evt.input!.file_path), op: "write" }]);
          setFileEdits(prev => [...prev, { path: String(evt.input!.file_path), type: "write", content: String(evt.input!.content ?? ""), timestamp: Date.now() }]);
        } else if (evt.tool === "edit" && evt.input?.file_path) {
          setTurnFiles(prev => [...prev, { path: String(evt.input!.file_path), op: "edit" }]);
          setFileEdits(prev => [...prev, { path: String(evt.input!.file_path), type: "edit", oldString: String(evt.input!.old_string ?? ""), newString: String(evt.input!.new_string ?? ""), timestamp: Date.now() }]);
        } else if ((evt.tool === "write" || evt.tool === "edit") && evt.input?.path) {
          setTurnFiles(prev => [...prev, { path: String(evt.input!.path), op: evt.tool! }]);
        }
        const tool: LiveTool = { toolUseId: evt.toolUseId, name: evt.tool ?? "", input: evt.input };
        toolMap.set(evt.toolUseId, tool);
        setLiveTools([...toolMap.values()]);
      } else if (evt.type === "tool_approval" && evt.toolUseId) {
        const tool: LiveTool = { toolUseId: evt.toolUseId, name: evt.tool ?? "", input: evt.input, pending: true };
        toolMap.set(evt.toolUseId, tool);
        setLiveTools([...toolMap.values()]);
      } else if (evt.type === "tool_result" && evt.toolUseId) {
        const existing = toolMap.get(evt.toolUseId);
        if (existing) { existing.result = evt.content; existing.isError = evt.isError; existing.pending = false; setLiveTools([...toolMap.values()]); }
      } else if (evt.type === "error") {
        toast.error(evt.error ?? "Stream error");
      } else if (evt.type === "budget_exceeded") {
        toast.error(`Token budget hit: ${Math.round((evt.tokensUsed ?? 0) / 1000)}k / ${Math.round((evt.budget ?? 0) / 1000)}k`);
      } else if (evt.type === "compaction") {
        setMessages(prev => [...prev, { id: `compact-${Date.now()}`, role: "assistant" as const, content: "", blocks: [{ type: "compaction" as const, text: evt.summary ?? "Context compacted" }], created_at: Date.now() }]);
      } else if (evt.type === "plan_update" && Array.isArray(evt.tasks)) {
        setPlan(evt.tasks as Array<{ id: string; title: string; done: boolean }>);
      } else if (evt.type === "new_session" && evt.sessionId) {
        fetchApi<Session>(`/api/sessions/${evt.sessionId}`)
          .then(s => onDispatch?.([s]))
          .catch(() => {});
      } else if (evt.type === "title_updated" && evt.title) {
        onSessionUpdate({ title: evt.title as string });
      } else if (evt.type === "done") {
        if (evt.usage) {
          const total = (evt.usage.input_tokens ?? 0) + (evt.usage.output_tokens ?? 0);
          if (total > 0) setLastTurnTokens(total);
        }
        fetchApi<{ session: Session; messages: Message[] }>(`/api/sessions/${session.id}`)
          .then(({ messages: msgs, session: s }) => {
            setMessages(msgs);
            onSessionUpdate({ status: s.status ?? "idle" });
          }).catch(() => {});
        setLiveText("");
        setLiveTools([]);
        setToolsElapsed(null);
        toolsStartRef.current = null;
        setStreaming(false);
      }
    };

    try {
      const token = await getToken();
      const res = await fetch(`/api/sessions/${session.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
        body: JSON.stringify({ message: msg }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let doneReceived = false;
      const processLine = (line: string) => {
        if (!line.startsWith("data: ")) return;
        const raw = line.slice(6).trim();
        if (!raw) return;
        try { const evt = JSON.parse(raw) as StreamEvent; if (evt.type === "done") doneReceived = true; handleEvent(evt); } catch {}
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) processLine(line);
      }
      if (buf) processLine(buf);

      if (!doneReceived) {
        setReconnecting(true);
        let attempts = 0;
        const pollUntilIdle = async () => {
          await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(1.5, attempts), 10000)));
          attempts++;
          try {
            const s = await fetchApi<{ session: Session; messages: Message[] }>(`/api/sessions/${session.id}`);
            if (s.session.status !== "running") {
              setMessages(s.messages);
              onSessionUpdate({ status: s.session.status ?? "idle" });
              setReconnecting(false);
              setStreaming(false);
              streamingRef.current = false;
              return;
            }
          } catch {}
          if (attempts < maxAttempts) { void pollUntilIdle(); }
          else {
            setReconnecting(false); setStreaming(false); streamingRef.current = false;
            onSessionUpdate({ status: "idle" });
            toast.error("Connection lost — session may still be running in the background");
          }
        };
        const maxAttempts = 8;
        void pollUntilIdle();
        return;
      }
    } catch (err) {
      if (err instanceof Error) toast.error(err.message);
      setStreaming(false);
      streamingRef.current = false;
      onSessionUpdate({ status: "idle" });
    }

    setMessages(prev => prev.filter(m => m.id !== optimistic.id));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming, session.id, onSessionUpdate]);

  const handleAskUserAnswer = useCallback((opt: string) => {
    setAskUserQuestion(null);
    void send(opt);
  }, [send]);

  const handleExitPlanApprove = useCallback(async () => {
    setExitPlanRequest(null);
    await patchSession({ plan_mode: 0 });
    void send("Approved, proceed.");
  }, [send, patchSession]);

  const handleExitPlanDeny = useCallback((feedback?: string) => {
    setExitPlanRequest(null);
    setDenyFeedback(null);
    void send(feedback ? `Stay in plan mode. ${feedback}` : "Stay in plan mode.");
  }, [send]);

  const resetOnSessionChange = useCallback(() => {
    setPlan([]);
    setLiveText("");
    setLiveTools([]);
  }, []);

  return {
    streaming, streamingRef, liveText, liveTools, toolsElapsed,
    textActive, reconnecting, lastTurnTokens,
    plan, askUserQuestion, exitPlanRequest, denyFeedback,
    turnFiles, fileEdits,
    setFileEdits, setDenyFeedback, setTurnFiles,
    send, stopStream, handleApproval,
    handleAskUserAnswer, handleExitPlanApprove, handleExitPlanDeny,
    resetOnSessionChange,
  };
}
