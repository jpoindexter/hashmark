/**
 * Loop detector — classify agent behavioral loops from session message history.
 *
 * 7-pattern taxonomy derived from:
 * - arxiv 2603.16021 (Model Workspace Protocol)
 * - arxiv 2603.16572 (Agent Skill Classification)
 * - arxiv 2603.05941 (XAI for Coding Agent Failures)
 */

export type LoopPattern =
  | "repetitive-response"     // P1: consecutive assistant messages are near-identical
  | "acknowledgment-stall"    // P2: agent keeps acknowledging without acting
  | "circular-reference"      // P3: same entity referenced repeatedly without resolution
  | "error-echo"              // P4: same error phrase repeats across turns
  | "clarification-pingpong"  // P5: agent re-asks questions already answered
  | "tool-obsession"          // P6: same tool/command mentioned in 5+ consecutive turns
  | "context-collapse";       // P7: agent refers to already-provided info as unknown

export interface LoopFinding {
  pattern: LoopPattern;
  severity: "warning" | "critical";
  label: string;
  description: string;
  /** 0-based indices into the messages array that triggered this finding */
  evidenceIndices: number[];
  /** Short snippet showing the evidence */
  snippet?: string;
}

interface Message {
  role: string;
  content: string;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Jaccard similarity on trigrams */
function similarity(a: string, b: string): number {
  const trigrams = (s: string): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i <= s.length - 3; i++) set.add(s.slice(i, i + 3));
    return set;
  };
  const ta = trigrams(normalize(a));
  const tb = trigrams(normalize(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const g of ta) if (tb.has(g)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/** Extract repeated word/phrase runs: returns phrases that appear >= n times in text */
function repeatedPhrases(text: string, minLen: number, minCount: number): string[] {
  const words = normalize(text).split(" ").filter(Boolean);
  const counts = new Map<string, number>();
  // bigrams + trigrams
  for (let size = 2; size <= 4; size++) {
    for (let i = 0; i <= words.length - size; i++) {
      const phrase = words.slice(i, i + size).join(" ");
      if (phrase.length < minLen) continue;
      counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
    }
  }
  return [...counts.entries()].filter(([, n]) => n >= minCount).map(([p]) => p);
}

const ACKNOWLEDGE_PATTERNS = [
  /^(i understand|i see|understood|got it|sure|certainly|of course|absolutely|i'll help|let me help|happy to help|great question)/i,
  /^(to help you|in order to help|i can help|i would be happy|i'll take a look|let me take a look)/i,
];

const CLARIFY_PATTERNS = [
  /could you (please |clarify|tell me|provide|share|confirm|specify|explain)/i,
  /what (do you mean|exactly|specifically|is the|are you)/i,
  /can you (clarify|elaborate|explain|tell me|provide|share|confirm)/i,
  /(i need (more|additional) (information|context|details)|please (clarify|provide|specify))/i,
];

const TOOL_COMMAND_RE = /(?:npm|npx|yarn|pnpm|git|curl|grep|find|cat|ls|cd|python|pip|node|tsc|eslint|prisma|jest|vitest)\s+[\w\-./]+/gi;

// ─── pattern detectors ────────────────────────────────────────────────────────

/** P1: Repetitive Response — consecutive assistant messages are near-identical */
function detectRepetitiveResponse(msgs: Message[]): LoopFinding | null {
  const assistants: Array<{ idx: number; content: string }> = [];
  msgs.forEach((m, i) => { if (m.role === "assistant") assistants.push({ idx: i, content: m.content }); });
  if (assistants.length < 2) return null;

  const pairs: number[] = [];
  for (let i = 1; i < assistants.length; i++) {
    const sim = similarity(assistants[i - 1].content, assistants[i].content);
    if (sim > 0.75) {
      pairs.push(assistants[i - 1].idx, assistants[i].idx);
    }
  }
  if (pairs.length === 0) return null;
  const unique = [...new Set(pairs)];

  return {
    pattern: "repetitive-response",
    severity: "critical",
    label: "Repetitive Response",
    description: `Agent produced near-identical responses in consecutive turns (≥75% similarity).`,
    evidenceIndices: unique,
    snippet: msgs[unique[0]]?.content.slice(0, 80),
  };
}

/** P2: Acknowledgment Stall — 3+ consecutive assistant messages that mostly acknowledge */
function detectAcknowledgmentStall(msgs: Message[]): LoopFinding | null {
  const run: number[] = [];
  let streak = 0;

  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i].role !== "assistant") { streak = 0; continue; }
    const content = msgs[i].content.trim().slice(0, 200);
    const isAck = ACKNOWLEDGE_PATTERNS.some(p => p.test(content));
    const short = msgs[i].content.trim().length < 300;
    if (isAck && short) {
      streak++;
      run.push(i);
    } else {
      streak = 0;
    }
    if (streak >= 3) {
      return {
        pattern: "acknowledgment-stall",
        severity: "warning",
        label: "Acknowledgment Stall",
        description: `Agent produced ${streak} short acknowledgment responses without substantive progress.`,
        evidenceIndices: run.slice(-streak),
        snippet: msgs[i].content.slice(0, 80),
      };
    }
  }
  return null;
}

/** P3: Circular Reference — same identifier mentioned in 4+ consecutive turns */
function detectCircularReference(msgs: Message[]): LoopFinding | null {
  // Extract identifiers: file paths, function names, class names
  const identRe = /(?:[\w/-]+\.(?:ts|tsx|js|py|go|rs|md)|(?:function|class|interface|type|const|let|var)\s+(\w+))/g;

  const windows: Array<{ entity: string; indices: number[] }> = [];
  const allEntities = new Map<string, number[]>();

  for (let i = 0; i < msgs.length; i++) {
    const matches = [...msgs[i].content.matchAll(identRe)].map(m => m[0]);
    for (const entity of matches) {
      const norm = normalize(entity);
      const arr = allEntities.get(norm) ?? [];
      arr.push(i);
      allEntities.set(norm, arr);
    }
  }

  for (const [entity, indices] of allEntities) {
    if (indices.length < 4) continue;
    // Check if they're in consecutive turns (within a window of 6 messages)
    const recent = indices.filter(i => i >= msgs.length - 8);
    if (recent.length >= 4) {
      windows.push({ entity, indices: recent });
    }
  }

  if (windows.length === 0) return null;
  const top = windows.sort((a, b) => b.indices.length - a.indices.length)[0];

  return {
    pattern: "circular-reference",
    severity: "warning",
    label: "Circular Reference",
    description: `"${top.entity}" referenced in ${top.indices.length} of the last 8 messages without apparent resolution.`,
    evidenceIndices: [...new Set(top.indices)],
    snippet: `"${top.entity}" appears ${top.indices.length}×`,
  };
}

/** P4: Error Echo — same error phrase repeated in 3+ turns */
function detectErrorEcho(msgs: Message[]): LoopFinding | null {
  const errorRe = /(?:error:|failed:|exception:|cannot|could not|unable to|not found|undefined|null reference|type error|syntax error)[^\n.!?]*/gi;

  const allErrors: Array<{ msg: string; idx: number }> = [];
  for (let i = 0; i < msgs.length; i++) {
    const matches = [...msgs[i].content.matchAll(errorRe)].map(m => normalize(m[0]));
    for (const m of matches) allErrors.push({ msg: m, idx: i });
  }

  // Group by similarity
  const seen = new Map<string, number[]>();
  for (const { msg, idx } of allErrors) {
    let placed = false;
    for (const [key, idxs] of seen) {
      if (similarity(key, msg) > 0.6) {
        idxs.push(idx);
        placed = true;
        break;
      }
    }
    if (!placed) seen.set(msg, [idx]);
  }

  for (const [errorText, indices] of seen) {
    const unique = [...new Set(indices)];
    if (unique.length >= 3) {
      return {
        pattern: "error-echo",
        severity: "critical",
        label: "Error Echo",
        description: `Same error phrase appeared in ${unique.length} separate turns — the agent may not be resolving it.`,
        evidenceIndices: unique,
        snippet: errorText.slice(0, 80),
      };
    }
  }
  return null;
}

/** P5: Clarification Ping-Pong — agent re-asks already-answered questions */
function detectClarificationPingPong(msgs: Message[]): LoopFinding | null {
  const clarifyMsgs: number[] = [];
  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i].role !== "assistant") continue;
    if (CLARIFY_PATTERNS.some(p => p.test(msgs[i].content))) {
      clarifyMsgs.push(i);
    }
  }

  if (clarifyMsgs.length < 2) return null;

  // Look for clarification followed by user response followed by another clarification on same topic
  const pingPongs: number[] = [];
  for (let i = 1; i < clarifyMsgs.length; i++) {
    const prevIdx = clarifyMsgs[i - 1];
    const currIdx = clarifyMsgs[i];
    // There should be at least one user message between them
    const hasUserBetween = msgs.slice(prevIdx + 1, currIdx).some(m => m.role === "user");
    if (hasUserBetween) {
      const sim = similarity(msgs[prevIdx].content, msgs[currIdx].content);
      if (sim > 0.4) {
        pingPongs.push(prevIdx, currIdx);
      }
    }
  }

  if (pingPongs.length === 0) return null;
  const unique = [...new Set(pingPongs)];

  return {
    pattern: "clarification-pingpong",
    severity: "warning",
    label: "Clarification Ping-Pong",
    description: `Agent re-asked similar clarifying questions after the user already responded.`,
    evidenceIndices: unique,
    snippet: msgs[unique[0]]?.content.slice(0, 80),
  };
}

/** P6: Tool Obsession — same command mentioned 5+ times in last 10 messages */
function detectToolObsession(msgs: Message[]): LoopFinding | null {
  const window = msgs.slice(-10);
  const commandCounts = new Map<string, { count: number; indices: number[] }>();

  for (let i = 0; i < window.length; i++) {
    const actualIdx = msgs.length - 10 + i;
    const commands = [...window[i].content.matchAll(TOOL_COMMAND_RE)].map(m => m[0].toLowerCase());
    for (const cmd of commands) {
      const base = cmd.split(/\s+/)[0]; // just the tool name
      const entry = commandCounts.get(base) ?? { count: 0, indices: [] };
      entry.count++;
      entry.indices.push(actualIdx);
      commandCounts.set(base, entry);
    }
  }

  for (const [cmd, { count, indices }] of commandCounts) {
    if (count >= 5) {
      return {
        pattern: "tool-obsession",
        severity: "warning",
        label: "Tool Obsession",
        description: `"${cmd}" mentioned ${count}× in the last 10 messages without apparent resolution.`,
        evidenceIndices: [...new Set(indices)],
        snippet: `${cmd} ×${count}`,
      };
    }
  }
  return null;
}

/** P7: Context Collapse — agent treats already-provided info as unknown */
function detectContextCollapse(msgs: Message[]): LoopFinding | null {
  if (msgs.length < 4) return null;

  const userFacts: Array<{ content: string; idx: number }> = [];
  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i].role === "user") userFacts.push({ content: normalize(msgs[i].content), idx: i });
  }

  const uncertaintyRe = /(?:i don't have|i'm not sure|i don't know|unclear|i cannot find|i need to know|what is|please tell me)\s+(?:the|your|what|how|which|where|when)/gi;

  const collapseIndices: number[] = [];

  for (let i = 2; i < msgs.length; i++) {
    if (msgs[i].role !== "assistant") continue;
    const uncMatches = [...msgs[i].content.matchAll(uncertaintyRe)].map(m => normalize(m[0]));
    if (uncMatches.length === 0) continue;

    // Check if any of the uncertain phrases relate to something the user already stated
    for (const unc of uncMatches) {
      for (const { content: userContent, idx: userIdx } of userFacts) {
        if (userIdx >= i) continue; // user spoke after this assistant message — skip
        const sim = similarity(unc, userContent.slice(0, 200));
        if (sim > 0.3) {
          collapseIndices.push(userIdx, i);
          break;
        }
      }
    }
  }

  if (collapseIndices.length === 0) return null;
  const unique = [...new Set(collapseIndices)];

  return {
    pattern: "context-collapse",
    severity: "critical",
    label: "Context Collapse",
    description: `Agent appears to have lost track of information the user already provided.`,
    evidenceIndices: unique,
    snippet: msgs[unique[unique.length - 1]]?.content.slice(0, 80),
  };
}

// ─── main export ─────────────────────────────────────────────────────────────

export interface LoopAnalysisResult {
  findings: LoopFinding[];
  /** Overall risk: clean, watch, or loop */
  status: "clean" | "watch" | "loop";
  messageCount: number;
  analyzedAt: number;
}

export function analyzeSessionLoop(messages: Message[]): LoopAnalysisResult {
  if (messages.length < 3) {
    return { findings: [], status: "clean", messageCount: messages.length, analyzedAt: Date.now() };
  }

  const detectors = [
    detectRepetitiveResponse,
    detectAcknowledgmentStall,
    detectCircularReference,
    detectErrorEcho,
    detectClarificationPingPong,
    detectToolObsession,
    detectContextCollapse,
  ];

  const findings: LoopFinding[] = [];
  for (const detect of detectors) {
    const result = detect(messages);
    if (result) findings.push(result);
  }

  const hasCritical = findings.some(f => f.severity === "critical");
  const status: LoopAnalysisResult["status"] = hasCritical
    ? "loop"
    : findings.length > 0
      ? "watch"
      : "clean";

  return { findings, status, messageCount: messages.length, analyzedAt: Date.now() };
}
