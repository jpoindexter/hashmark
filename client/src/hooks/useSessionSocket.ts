import { useRef, useCallback, useEffect, useState } from "react";
import { apiUrl } from "../lib/api";
import type { StreamingState, ContentBlock } from "../components/ChatMessages";

interface UseSessionSocketOpts {
  sessionId: string | null;
  onStreamText: (text: string) => void;
  onStreamingState: (state: StreamingState | null) => void;
  onStreamingChange: (streaming: boolean) => void;
  selectedModel: string;
  thinking: boolean;
  systemPrompt?: string;
}

export function useSessionSocket(opts: UseSessionSocketOpts) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  const { sessionId, onStreamText, onStreamingState, onStreamingChange, selectedModel, thinking, systemPrompt } = opts;

  // Connect when session changes
  useEffect(() => {
    if (!sessionId) return;

    const tokenUrl = apiUrl(`/api/sessions/${sessionId}/ws`);
    const wsUrl = `ws://localhost:3200${tokenUrl}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    const blocks: ContentBlock[] = [];
    let textAccum = "";

    ws.onopen = () => setConnected(true);

    ws.onmessage = (evt) => {
      let msg: { type: string; [key: string]: unknown };
      try { msg = JSON.parse(evt.data); } catch { return; }

      if (msg.type === "text") {
        const text = String(msg.text ?? "");
        textAccum += text;
        onStreamText(textAccum);
        // Update blocks with accumulated text
        const textBlock = blocks.find(b => b.type === "text");
        if (textBlock) textBlock.text = textAccum;
        else blocks.push({ type: "text", text: textAccum });
        onStreamingState({ blocks: [...blocks] });
      }

      if (msg.type === "thinking") {
        blocks.push({ type: "thinking", content: String(msg.content ?? ""), id: String(blocks.length) });
        onStreamingState({ blocks: [...blocks] });
      }

      if (msg.type === "tool_use") {
        blocks.push({
          type: "tool_use",
          tool: String(msg.tool ?? ""),
          input: (msg.input ?? {}) as Record<string, unknown>,
          toolUseId: String(msg.toolUseId ?? ""),
        });
        onStreamingState({ blocks: [...blocks] });
      }

      if (msg.type === "tool_result") {
        blocks.push({
          type: "tool_result",
          toolUseId: String(msg.toolUseId ?? ""),
          content: String(msg.content ?? ""),
          isError: msg.isError === true,
        });
        onStreamingState({ blocks: [...blocks] });
      }

      if (msg.type === "tool_approval") {
        // Show approval UI -- for now auto-approve
        // TODO: integrate ToolApprovalCard
        ws.send(JSON.stringify({ type: "approve_tool" }));
      }

      if (msg.type === "done") {
        const usage = msg.usage as { input_tokens: number; output_tokens: number } | undefined;
        onStreamingState({ blocks: [...blocks], usage });
        onStreamingChange(false);
      }

      if (msg.type === "error") {
        onStreamingChange(false);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [sessionId]);

  const sendMessage = useCallback((text: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;

    onStreamingChange(true);
    onStreamText("");
    onStreamingState({ blocks: [] });

    ws.send(JSON.stringify({
      type: "user_message",
      text,
      model: selectedModel,
      thinking,
      systemPrompt: systemPrompt ?? "",
    }));
    return true;
  }, [selectedModel, thinking, systemPrompt, onStreamingChange, onStreamText, onStreamingState]);

  const cancel = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: "cancel" }));
  }, []);

  const approveTool = useCallback((toolUseId: string) => {
    wsRef.current?.send(JSON.stringify({ type: "approve_tool", toolUseId }));
  }, []);

  const denyTool = useCallback((toolUseId: string) => {
    wsRef.current?.send(JSON.stringify({ type: "deny_tool", toolUseId }));
  }, []);

  return { connected, sendMessage, cancel, approveTool, denyTool };
}
