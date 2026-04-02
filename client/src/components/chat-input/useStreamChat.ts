import { useRef, useCallback } from "react";
import { fetchApi } from "../../lib/api";
import { toast } from "../../hooks/useToast";
import type { StreamingState } from "../ChatMessages";

interface Session {
  id: string;
  title: string;
  status: "idle" | "streaming";
}

const AUTO_MODEL_LABELS: Record<string, string> = {
  "claude-haiku-4-5-20251001": "Haiku 4.5",
  "claude-sonnet-4-6": "Sonnet 4.6",
  "claude-opus-4-6": "Opus 4.6",
};

function resolveAutoModel(message: string): string {
  const len = message.trim().length;
  if (len < 100) return "claude-haiku-4-5-20251001";
  if (len < 500) return "claude-sonnet-4-6";
  return "claude-opus-4-6";
}

interface UseStreamChatOptions {
  sessionId: string | null;
  selectedModel: string;
  thinking: boolean;
  planMode: boolean;
  selectedAgent: { id: string; name: string } | null;
  skipContextRef: React.MutableRefObject<boolean>;
  onStreamText: (text: string) => void;
  onStreamingState?: (state: StreamingState | null) => void;
  onStreamingChange: (streaming: boolean) => void;
  onSessionCreated?: (sessionId: string) => void;
  onSent: () => void;
  onClearInput: () => void;
  onWarning: (msg: string) => void;
  lastWarningPctRef: React.MutableRefObject<number>;
}

export function useStreamChat({
  sessionId,
  selectedModel,
  thinking,
  planMode,
  selectedAgent,
  skipContextRef,
  onStreamText,
  onStreamingState,
  onStreamingChange,
  onSessionCreated,
  onSent,
  onClearInput,
  onWarning,
  lastWarningPctRef,
}: UseStreamChatOptions) {
  const abortRef = useRef<(() => void) | null>(null);
  const retryCountRef = useRef(0);
  const lastSentMessageRef = useRef<string | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleAutoRetry = useCallback(
    (messageText: string) => {
      const count = retryCountRef.current;
      if (count >= 2) {
        window.dispatchEvent(
          new CustomEvent("studio:stream-failed", {
            detail: { lastUserMessage: messageText },
          })
        );
        toast.error("Stream failed after 2 retries. Use the Retry button to try again.");
        return;
      }
      retryCountRef.current = count + 1;
      const attempt = retryCountRef.current;
      toast.error(`Stream error. Retrying (${attempt}/2)...`);
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        void sendMessageWithText(messageText);
      }, 2000);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const sendMessageWithText = async (
    overrideText?: string,
    attachedImage?: { name: string; dataUrl: string } | null
  ) => {
    const raw = overrideText ?? "";
    const text = attachedImage
      ? `${raw}\n\n[Image attached: ${attachedImage.name}]`
      : raw;
    if (!raw && !attachedImage) return;

    lastSentMessageRef.current = text;

    let sid = sessionId;
    if (!sid) {
      try {
        const res = await fetchApi("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!res.ok) throw new Error("Session creation failed");
        const data = (await res.json()) as { session: Session };
        sid = data.session.id;
        onSessionCreated?.(sid);
      } catch {
        toast.error("Failed to create session");
        return;
      }
    }

    onStreamingChange(true);
    onStreamText("");
    onStreamingState?.(null);

    let resolvedModel = selectedModel;
    if (selectedModel === "auto") {
      resolvedModel = resolveAutoModel(text);
      const label = AUTO_MODEL_LABELS[resolvedModel] ?? resolvedModel;
      toast.success(`Auto-routed to ${label}`);
    }

    let systemPrompt = (localStorage.getItem("studio:system_prompt") ?? "").trim();
    if (thinking) systemPrompt += "\n\nUse extended thinking before responding.";
    if (planMode) systemPrompt += "\n\nEnter plan mode: respond with a structured plan only, do not write code.";

    let res: Response;
    try {
      res = await fetchApi(`/api/sessions/${sid}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          model: resolvedModel,
          thinking,
          planMode,
          ...(systemPrompt && { systemPrompt }),
          ...(skipContextRef.current && { skipContext: true }),
          ...(selectedAgent && { agentId: selectedAgent.id }),
        }),
      });
    } catch {
      onStreamingChange(false);
      scheduleAutoRetry(text);
      return;
    }

    if (!res.ok || !res.body) {
      onStreamingChange(false);
      if (res.status >= 500) {
        scheduleAutoRetry(text);
      } else {
        toast.error(`Failed to send message (${res.status})`);
      }
      return;
    }

    skipContextRef.current = false;
    onSent();
    if (!overrideText) {
      onClearInput();
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let assembled = "";

    abortRef.current = () => {
      reader.cancel().catch(() => {});
      fetchApi(`/api/sessions/${sid}/interrupt`, { method: "POST" }).catch(() => {});
    };

    type SBlock = import("../ChatMessages").ContentBlock;
    const blocks: SBlock[] = [];
    let activeThinkingIdx = -1;

    let streamCompleted = false;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          streamCompleted = true;
          break;
        }
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const rawLine = line.slice(6).trim();
          if (!rawLine) continue;
          try {
            const evt = JSON.parse(rawLine) as Record<string, unknown>;
            const evtType = evt.type as string;

            if (evtType === "text" && evt.text) {
              assembled += evt.text as string;
              onStreamText(assembled);

              const lastBlock = blocks[blocks.length - 1];
              if (lastBlock && lastBlock.type === "text") {
                (lastBlock as { text: string }).text += evt.text as string;
              } else {
                blocks.push({ type: "text", text: evt.text as string });
              }
              activeThinkingIdx = -1;
            } else if (evtType === "thinking" || evtType === "thinking_delta") {
              const content = (evt.content ?? evt.text ?? "") as string;
              if (
                activeThinkingIdx >= 0 &&
                blocks[activeThinkingIdx]?.type === "thinking"
              ) {
                (blocks[activeThinkingIdx] as { content: string }).content += content;
              } else {
                activeThinkingIdx = blocks.length;
                blocks.push({
                  type: "thinking",
                  content,
                  id: (evt.id as string) ?? undefined,
                });
              }
            } else if (evtType === "tool_use" || evtType === "tool_call") {
              activeThinkingIdx = -1;
              blocks.push({
                type: "tool_use",
                tool: (evt.tool ?? evt.name ?? "unknown") as string,
                input: (evt.input ?? {}) as Record<string, unknown>,
                toolUseId: (evt.toolUseId ?? evt.id ?? "") as string,
              });
            } else if (evtType === "tool_result") {
              activeThinkingIdx = -1;
              const content =
                typeof evt.content === "string"
                  ? evt.content
                  : JSON.stringify(evt.content ?? "");
              if (content.length > 0) {
                blocks.push({
                  type: "tool_result",
                  toolUseId: (evt.toolUseId ?? "") as string,
                  content: content.slice(0, 4000),
                  isError: evt.is_error === true,
                });
              }
            } else if (evtType === "progress") {
              activeThinkingIdx = -1;
              blocks.push({ type: "progress", text: (evt.text ?? "") as string });
            } else if (evtType === "warning") {
              const msg = (evt.message ?? "") as string;
              const pctMatch = msg.match(/(\d+)%/);
              const pct = pctMatch ? parseInt(pctMatch[1], 10) : 0;
              if (pct > lastWarningPctRef.current) {
                onWarning(msg);
              }
              lastWarningPctRef.current = pct;
            }

            onStreamingState?.({
              blocks: [...blocks],
              cost: evt.cost as number | undefined,
              usage: evt.usage as
                | { input_tokens: number; output_tokens: number }
                | undefined,
            });
          } catch {
            console.warn("Failed to parse SSE event:", rawLine);
          }
        }
      }
    } catch {
      onStreamingChange(false);
      scheduleAutoRetry(text);
      return;
    } finally {
      abortRef.current = null;
      if (streamCompleted) {
        retryCountRef.current = 0;
        onStreamingChange(false);
        onStreamText("");
      }
    }
  };

  return {
    sendMessageWithText,
    abortRef,
    retryCountRef,
    lastSentMessageRef,
    retryTimerRef,
  };
}
