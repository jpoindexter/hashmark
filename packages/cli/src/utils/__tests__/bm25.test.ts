import { describe, it, expect } from "vitest";
import { BM25Index } from "../bm25.js";
import type { BM25Document } from "../bm25.js";

function makeDoc(id: string, heading: string, content: string, sectionType = "overview"): BM25Document {
  return { id, heading, content, sectionType };
}

// ============================================================================
// Basic search
// ============================================================================

describe("BM25Index", () => {
  it("returns empty results for empty index", () => {
    const index = new BM25Index();
    expect(index.search("hello")).toEqual([]);
  });

  it("returns empty results for empty query", () => {
    const index = new BM25Index();
    index.addDocument(makeDoc("1", "Title", "some content"));
    expect(index.search("")).toEqual([]);
  });

  it("returns empty results for stop-word-only query", () => {
    const index = new BM25Index();
    index.addDocument(makeDoc("1", "Title", "some content"));
    expect(index.search("the and is")).toEqual([]);
  });

  it("finds a document by content term", () => {
    const index = new BM25Index();
    index.addDocument(makeDoc("1", "Auth", "authentication middleware validates tokens"));
    const results = index.search("authentication");

    expect(results).toHaveLength(1);
    expect(results[0].document.id).toBe("1");
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("finds a document by heading term", () => {
    const index = new BM25Index();
    index.addDocument(makeDoc("1", "Database Models", "User and Post tables"));
    const results = index.search("database");

    expect(results).toHaveLength(1);
    expect(results[0].document.id).toBe("1");
  });

  it("returns documents with matching terms only", () => {
    const index = new BM25Index();
    index.addDocument(makeDoc("1", "Auth", "handles authentication"));
    index.addDocument(makeDoc("2", "Billing", "processes payments"));
    index.addDocument(makeDoc("3", "Auth Guard", "protects routes with authentication"));
    const results = index.search("authentication");

    expect(results).toHaveLength(2);
    const ids = results.map((r) => r.document.id);
    expect(ids).toContain("1");
    expect(ids).toContain("3");
    expect(ids).not.toContain("2");
  });
});

// ============================================================================
// Ranking
// ============================================================================

describe("ranking", () => {
  it("ranks document with more term occurrences higher", () => {
    const index = new BM25Index();
    index.addDocument(makeDoc("few", "Title", "react component"));
    index.addDocument(makeDoc("many", "Title", "react component uses react hooks and react context"));
    const results = index.search("react");

    expect(results[0].document.id).toBe("many");
    expect(results[1].document.id).toBe("few");
  });

  it("ranks rarer terms higher (IDF)", () => {
    const index = new BM25Index();
    // "component" appears in all 3 docs, "prisma" only in one
    index.addDocument(makeDoc("1", "Components", "component button styles"));
    index.addDocument(makeDoc("2", "Database", "component prisma schema models"));
    index.addDocument(makeDoc("3", "Components", "component card layout"));
    const results = index.search("prisma");

    expect(results).toHaveLength(1);
    expect(results[0].document.id).toBe("2");
  });

  it("handles multi-word queries", () => {
    const index = new BM25Index();
    index.addDocument(makeDoc("1", "Auth", "login middleware session tokens"));
    index.addDocument(makeDoc("2", "Database", "user table schema migrations"));
    index.addDocument(makeDoc("3", "API", "login endpoint user authentication tokens"));
    const results = index.search("login tokens");

    // Doc 3 matches both "login" and "tokens", doc 1 also matches both
    expect(results.length).toBeGreaterThanOrEqual(2);
    const topIds = results.slice(0, 2).map((r) => r.document.id);
    expect(topIds).toContain("1");
    expect(topIds).toContain("3");
  });

  it("results are sorted by descending score", () => {
    const index = new BM25Index();
    index.addDocument(makeDoc("1", "A", "react react react"));
    index.addDocument(makeDoc("2", "B", "react"));
    index.addDocument(makeDoc("3", "C", "react react"));
    const results = index.search("react");

    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });
});

// ============================================================================
// Limit
// ============================================================================

describe("limit", () => {
  it("respects the limit parameter", () => {
    const index = new BM25Index();
    for (let i = 0; i < 10; i++) {
      index.addDocument(makeDoc(`${i}`, "Title", `react component number ${i}`));
    }
    const results = index.search("react", 3);
    expect(results).toHaveLength(3);
  });

  it("returns all results when fewer than limit", () => {
    const index = new BM25Index();
    index.addDocument(makeDoc("1", "Title", "react component"));
    index.addDocument(makeDoc("2", "Title", "react hooks"));
    const results = index.search("react", 10);
    expect(results).toHaveLength(2);
  });

  it("defaults limit to 5", () => {
    const index = new BM25Index();
    for (let i = 0; i < 10; i++) {
      index.addDocument(makeDoc(`${i}`, "Title", `react component ${i}`));
    }
    const results = index.search("react");
    expect(results).toHaveLength(5);
  });
});

// ============================================================================
// Tokenizer behavior
// ============================================================================

describe("tokenizer", () => {
  it("is case-insensitive", () => {
    const index = new BM25Index();
    index.addDocument(makeDoc("1", "Title", "React Component"));
    expect(index.search("react")).toHaveLength(1);
    expect(index.search("REACT")).toHaveLength(1);
  });

  it("strips punctuation", () => {
    const index = new BM25Index();
    index.addDocument(makeDoc("1", "Title", "user's authentication (JWT)"));
    expect(index.search("jwt")).toHaveLength(1);
    expect(index.search("authentication")).toHaveLength(1);
  });

  it("filters single-character tokens", () => {
    const index = new BM25Index();
    index.addDocument(makeDoc("1", "Title", "a b c real content here"));
    // "a", "b", "c" filtered out; searching for "b" returns nothing
    expect(index.search("b")).toEqual([]);
    expect(index.search("real")).toHaveLength(1);
  });
});
