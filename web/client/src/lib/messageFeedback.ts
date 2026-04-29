const LS_KEY = "hm-message-feedback";

export type FeedbackRating = "positive" | "negative";
export type NegativeTag = "Wrong info" | "Not helpful" | "Too long" | "Off-topic";

export interface FeedbackEntry {
  sessionId: string;
  messageId: string;
  rating: FeedbackRating;
  tags?: NegativeTag[];
  comment?: string;
  timestamp: number;
}

export interface FeedbackStats {
  totalPositive: number;
  totalNegative: number;
  topNegativeTags: Array<{ tag: NegativeTag; count: number }>;
  sessionsWithMostNegative: Array<{ sessionId: string; count: number }>;
}

function loadAll(): FeedbackEntry[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as FeedbackEntry[]) : [];
  } catch {
    return [];
  }
}

function saveAll(entries: FeedbackEntry[]): void {
  localStorage.setItem(LS_KEY, JSON.stringify(entries));
}

export function getFeedbackForSession(sessionId: string): Map<string, FeedbackEntry> {
  const all = loadAll();
  const map = new Map<string, FeedbackEntry>();
  for (const e of all) {
    if (e.sessionId === sessionId) map.set(e.messageId, e);
  }
  return map;
}

export function setFeedback(entry: FeedbackEntry): void {
  const all = loadAll().filter(e => !(e.sessionId === entry.sessionId && e.messageId === entry.messageId));
  all.push(entry);
  saveAll(all);
}

export function removeFeedback(sessionId: string, messageId: string): void {
  const all = loadAll().filter(e => !(e.sessionId === sessionId && e.messageId === messageId));
  saveAll(all);
}

export function getFeedbackStats(): FeedbackStats {
  const all = loadAll();

  const totalPositive = all.filter(e => e.rating === "positive").length;
  const totalNegative = all.filter(e => e.rating === "negative").length;

  const tagCounts = new Map<NegativeTag, number>();
  for (const e of all) {
    if (e.rating === "negative" && e.tags) {
      for (const t of e.tags) {
        tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
      }
    }
  }
  const topNegativeTags = [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);

  const sessionCounts = new Map<string, number>();
  for (const e of all) {
    if (e.rating === "negative") {
      sessionCounts.set(e.sessionId, (sessionCounts.get(e.sessionId) ?? 0) + 1);
    }
  }
  const sessionsWithMostNegative = [...sessionCounts.entries()]
    .map(([sessionId, count]) => ({ sessionId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return { totalPositive, totalNegative, topNegativeTags, sessionsWithMostNegative };
}
