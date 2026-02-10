/**
 * Lightweight BM25 keyword search index.
 * Runs entirely in-process — no database dependency.
 */

export interface BM25Document {
  id: string;
  heading: string;
  content: string;
  sectionType: string;
}

export interface BM25Result {
  document: BM25Document;
  score: number;
}

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "do", "for",
  "from", "had", "has", "have", "he", "her", "his", "how", "i", "if",
  "in", "into", "is", "it", "its", "just", "me", "my", "no", "nor",
  "not", "of", "on", "or", "our", "out", "own", "so", "than", "that",
  "the", "their", "them", "then", "there", "these", "they", "this",
  "to", "too", "up", "us", "very", "was", "we", "were", "what", "when",
  "which", "who", "will", "with", "would", "you", "your",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

export class BM25Index {
  private documents: BM25Document[] = [];
  private docTokens: Map<string, string[]> = new Map();
  private docFrequencies: Map<string, number> = new Map();
  private avgDocLength = 0;

  // BM25 parameters
  private k1 = 1.5;
  private b = 0.75;

  addDocument(doc: BM25Document): void {
    this.documents.push(doc);
    const tokens = tokenize(doc.heading + " " + doc.content);
    this.docTokens.set(doc.id, tokens);

    // Track unique terms per document for document frequency
    const uniqueTerms = new Set(tokens);
    for (const term of uniqueTerms) {
      this.docFrequencies.set(term, (this.docFrequencies.get(term) ?? 0) + 1);
    }

    // Update average document length
    let totalTokens = 0;
    for (const t of this.docTokens.values()) totalTokens += t.length;
    this.avgDocLength = totalTokens / this.docTokens.size;
  }

  search(query: string, limit = 5): BM25Result[] {
    const queryTerms = tokenize(query);
    if (queryTerms.length === 0) return [];

    const N = this.documents.length;
    if (N === 0) return [];

    const scores: Map<string, number> = new Map();

    for (const doc of this.documents) {
      const tokens = this.docTokens.get(doc.id);
      if (!tokens) continue;

      const docLength = tokens.length;
      let score = 0;

      // Count term frequencies in this document
      const termFreq = new Map<string, number>();
      for (const t of tokens) {
        termFreq.set(t, (termFreq.get(t) ?? 0) + 1);
      }

      for (const term of queryTerms) {
        const tf = termFreq.get(term) ?? 0;
        if (tf === 0) continue;

        const df = this.docFrequencies.get(term) ?? 0;
        // IDF: log((N - df + 0.5) / (df + 0.5) + 1)
        const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
        // BM25 TF component
        const tfNorm =
          (tf * (this.k1 + 1)) /
          (tf + this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength)));

        score += idf * tfNorm;
      }

      if (score > 0) {
        scores.set(doc.id, score);
      }
    }

    return this.documents
      .filter((doc) => scores.has(doc.id))
      .map((doc) => ({ document: doc, score: scores.get(doc.id)! }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
