import { describe, it, expect } from "vitest";
import { analyzeFileAST } from "../ast-complexity.js";

function analyze(code: string) {
  return analyzeFileAST(code, "test.ts");
}

function fn(code: string) {
  const result = analyze(`function test() { ${code} }`);
  return result!.functions[0];
}

// ============================================================================
// Cyclomatic Complexity (McCabe)
// ============================================================================

describe("cyclomatic complexity", () => {
  it("returns 1 for empty function", () => {
    expect(fn("").cyclomatic).toBe(1);
  });

  it("counts if statements", () => {
    expect(fn("if (x) {}").cyclomatic).toBe(2);
    expect(fn("if (x) {} if (y) {}").cyclomatic).toBe(3);
  });

  it("counts else-if as separate decisions", () => {
    expect(fn("if (x) {} else if (y) {} else {}").cyclomatic).toBe(3);
  });

  it("counts loops", () => {
    expect(fn("for (let i = 0; i < 10; i++) {}").cyclomatic).toBe(2);
    expect(fn("while (true) {}").cyclomatic).toBe(2);
    expect(fn("do {} while (true)").cyclomatic).toBe(2);
    expect(fn("for (const x of arr) {}").cyclomatic).toBe(2);
    expect(fn("for (const x in obj) {}").cyclomatic).toBe(2);
  });

  it("counts switch cases (non-default)", () => {
    expect(fn("switch (x) { case 1: break; case 2: break; default: break; }").cyclomatic).toBe(3);
  });

  it("counts catch clauses", () => {
    expect(fn("try {} catch (e) {}").cyclomatic).toBe(2);
  });

  it("counts ternary operators", () => {
    expect(fn("const x = a ? 1 : 2;").cyclomatic).toBe(2);
  });

  it("counts logical operators (&&, ||, ??)", () => {
    expect(fn("const x = a && b;").cyclomatic).toBe(2);
    expect(fn("const x = a || b;").cyclomatic).toBe(2);
    expect(fn("const x = a ?? b;").cyclomatic).toBe(2);
    expect(fn("const x = a && b && c;").cyclomatic).toBe(3);
    expect(fn("const x = a && b || c;").cyclomatic).toBe(3);
  });

  it("counts each optional chaining operator", () => {
    expect(fn("const x = a?.b;").cyclomatic).toBe(2);
    expect(fn("const x = a?.b?.c;").cyclomatic).toBe(3);
    expect(fn("const x = a?.b?.c?.d;").cyclomatic).toBe(4);
  });

  it("does not count default case", () => {
    expect(fn("switch (x) { default: break; }").cyclomatic).toBe(1);
  });
});

// ============================================================================
// Cognitive Complexity (SonarQube)
// ============================================================================

describe("cognitive complexity", () => {
  it("returns 0 for empty function", () => {
    expect(fn("").cognitive).toBe(0);
  });

  it("counts if with nesting penalty", () => {
    // if at nesting 0: +1
    expect(fn("if (x) {}").cognitive).toBe(1);
  });

  it("counts nested if with increasing penalty", () => {
    // outer if: +1 (nesting 0)
    // inner if: +1 + 1 (nesting 1)
    expect(fn("if (x) { if (y) {} }").cognitive).toBe(3);
  });

  it("counts else as +1 with no nesting increase", () => {
    // if: +1, else: +1
    expect(fn("if (x) {} else {}").cognitive).toBe(2);
  });

  it("counts else-if as +1 without nesting penalty", () => {
    // if: +1, else if: +1, else: +1
    expect(fn("if (x) {} else if (y) {} else {}").cognitive).toBe(3);
  });

  it("counts loops with nesting penalty", () => {
    // for at nesting 0: +1
    expect(fn("for (let i = 0; i < 10; i++) {}").cognitive).toBe(1);
    // for at nesting 0: +1, if at nesting 1: +1+1
    expect(fn("for (let i = 0; i < 10; i++) { if (x) {} }").cognitive).toBe(3);
  });

  it("counts switch as +1 (not per case)", () => {
    // switch: +1 at nesting 0
    expect(fn("switch (x) { case 1: break; case 2: break; default: break; }").cognitive).toBe(1);
  });

  it("counts catch with nesting penalty", () => {
    // catch: +1 at nesting 0
    expect(fn("try {} catch (e) {}").cognitive).toBe(1);
  });

  it("counts ternary with nesting penalty", () => {
    expect(fn("const x = a ? 1 : 2;").cognitive).toBe(1);
  });

  // SonarQube spec: same-operator sequences count as +1
  it("counts logical operator sequences correctly", () => {
    // a && b: one sequence = +1
    expect(fn("const x = a && b;").cognitive).toBe(1);
    // a && b && c: same operator chain = +1
    expect(fn("const x = a && b && c;").cognitive).toBe(1);
    // a && b && c && d: same operator chain = +1
    expect(fn("const x = a && b && c && d;").cognitive).toBe(1);
    // a || b || c: same operator chain = +1
    expect(fn("const x = a || b || c;").cognitive).toBe(1);
  });

  it("counts operator changes in mixed sequences", () => {
    // a && b || c: two sequences (&&, then ||) = +2
    expect(fn("const x = a && b || c;").cognitive).toBe(2);
    // a || b && c: two sequences = +2
    expect(fn("const x = a || b && c;").cognitive).toBe(2);
  });

  it("does not count optional chaining", () => {
    expect(fn("const x = a?.b?.c;").cognitive).toBe(0);
  });

  it("counts nullish coalescing as logical operator", () => {
    expect(fn("const x = a ?? b;").cognitive).toBe(1);
    // a ?? b ?? c: same operator chain = +1
    expect(fn("const x = a ?? b ?? c;").cognitive).toBe(1);
  });

  it("counts labeled break/continue", () => {
    expect(fn("outer: for (;;) { break outer; }").cognitive).toBe(2); // for: +1, break label: +1
  });

  it("does not count unlabeled break/continue", () => {
    expect(fn("for (;;) { break; }").cognitive).toBe(1); // just the for
  });

  it("increases nesting for nested functions", () => {
    // outer arrow: nesting 0 (no increment for function itself)
    // if inside arrow at nesting 1: +1 + 1 = +2
    const result = analyze("function test() { const inner = () => { if (x) {} }; }");
    expect(result!.functions[0].cognitive).toBe(2);
  });

  it("detects direct recursion", () => {
    const result = analyze("function factorial(n) { return n <= 1 ? 1 : n * factorial(n - 1); }");
    // ternary: +1, recursion: +1
    expect(result!.functions[0].cognitive).toBe(2);
  });

  it("handles deeply nested code", () => {
    // if(0): +1, for(1): +1+1, if(2): +1+2, while(3): +1+3 = 10
    const code = "if (a) { for (;;) { if (b) { while (c) {} } } }";
    expect(fn(code).cognitive).toBe(10);
  });
});

// ============================================================================
// Halstead Metrics
// ============================================================================

describe("halstead metrics", () => {
  it("counts operators and operands", () => {
    const f = fn("const x = a + b;");
    expect(f.halstead.totalOperators).toBeGreaterThan(0);
    expect(f.halstead.totalOperands).toBeGreaterThan(0);
  });

  it("computes volume as N * log2(n)", () => {
    const f = fn("const x = 1; const y = 2; const z = x + y;");
    expect(f.halstead.volume).toBeGreaterThan(0);
    expect(f.halstead.vocabulary).toBe(f.halstead.operators + f.halstead.operands);
    expect(f.halstead.length).toBe(f.halstead.totalOperators + f.halstead.totalOperands);
  });

  it("computes estimated bugs as V/3000", () => {
    const f = fn("const x = 1; const y = 2;");
    expect(f.halstead.estimatedBugs).toBeCloseTo(f.halstead.volume / 3000, 2);
  });

  it("handles empty function gracefully", () => {
    const f = fn("");
    expect(f.halstead.volume).toBe(0);
    expect(f.halstead.estimatedBugs).toBe(0);
  });
});

// ============================================================================
// Maintainability Index
// ============================================================================

describe("maintainability index", () => {
  it("returns high MI for simple functions", () => {
    const f = fn("return 1;");
    expect(f.maintainabilityIndex).toBeGreaterThan(50);
  });

  it("returns lower MI for complex functions", () => {
    const simple = fn("return 1;");
    const complex = fn(`
      if (a) { for (;;) { if (b) { while (c) { switch (d) { case 1: break; case 2: break; } } } } }
      if (e) { for (;;) { if (f) { while (g) { switch (h) { case 1: break; case 2: break; } } } } }
    `);
    expect(complex.maintainabilityIndex).toBeLessThan(simple.maintainabilityIndex);
  });

  it("clamps to 0 minimum", () => {
    const f = fn("return 1;");
    expect(f.maintainabilityIndex).toBeGreaterThanOrEqual(0);
  });

  it("caps at 100 max", () => {
    const f = fn("return 1;");
    expect(f.maintainabilityIndex).toBeLessThanOrEqual(100);
  });
});

// ============================================================================
// Function Discovery
// ============================================================================

describe("function discovery", () => {
  it("discovers named function declarations", () => {
    const result = analyze("function hello() { return 1; }");
    expect(result!.functions).toHaveLength(1);
    expect(result!.functions[0].name).toBe("hello");
  });

  it("discovers arrow functions in variable declarations", () => {
    const result = analyze("const greet = () => { return 1; };");
    expect(result!.functions).toHaveLength(1);
    expect(result!.functions[0].name).toBe("greet");
  });

  it("discovers class methods", () => {
    const result = analyze("class Foo { bar() { return 1; } baz() { return 2; } }");
    expect(result!.functions).toHaveLength(2);
    expect(result!.functions[0].name).toBe("Foo.bar");
    expect(result!.functions[1].name).toBe("Foo.baz");
  });

  it("discovers exported functions", () => {
    const result = analyze("export function doStuff() { return 1; }");
    expect(result!.functions).toHaveLength(1);
    expect(result!.functions[0].name).toBe("doStuff");
  });

  it("discovers export default function", () => {
    const result = analyze("export default function handler() { return 1; }");
    expect(result!.functions).toHaveLength(1);
    expect(result!.functions[0].name).toBe("handler");
  });

  it("returns empty functions array for files with no functions", () => {
    const result = analyze("const x = 1; const y = 2;");
    expect(result!.functions).toHaveLength(0);
    expect(result!.fileCyclomatic).toBe(1);
    expect(result!.fileCognitive).toBe(0);
  });
});

// ============================================================================
// File-Level Aggregation
// ============================================================================

describe("file-level aggregation", () => {
  it("sums cyclomatic across functions", () => {
    const result = analyze(`
      function a() { if (x) {} }
      function b() { if (y) {} if (z) {} }
    `);
    // a: CC=2, b: CC=3, total=5
    expect(result!.fileCyclomatic).toBe(5);
  });

  it("sums cognitive across functions", () => {
    const result = analyze(`
      function a() { if (x) {} }
      function b() { if (y) { if (z) {} } }
    `);
    // a: cog=1, b: cog=1+2=3, total=4
    expect(result!.fileCognitive).toBe(4);
  });

  it("averages maintainability index", () => {
    const result = analyze(`
      function a() { return 1; }
      function b() { return 2; }
    `);
    expect(result!.avgMaintainability).toBeGreaterThan(0);
  });

  it("counts total lines", () => {
    const result = analyze("function a() {\n  return 1;\n}\n");
    expect(result!.loc).toBe(4);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("edge cases", () => {
  it("returns null for unparseable code", () => {
    const result = analyze("this is not valid javascript {{{");
    expect(result).toBeNull();
  });

  it("handles JSX", () => {
    const result = analyze(`
      function App() {
        return <div>{x ? <span>yes</span> : <span>no</span>}</div>;
      }
    `);
    expect(result).not.toBeNull();
    expect(result!.functions).toHaveLength(1);
  });

  it("handles TypeScript generics", () => {
    const result = analyze(`
      function identity<T>(x: T): T { return x; }
    `);
    expect(result).not.toBeNull();
    expect(result!.functions[0].cyclomatic).toBe(1);
  });

  it("handles async/await", () => {
    const result = analyze(`
      async function fetchData() {
        try {
          const res = await fetch("/api");
          if (!res.ok) throw new Error("fail");
          return await res.json();
        } catch (e) {
          return null;
        }
      }
    `);
    expect(result).not.toBeNull();
    // if + catch = CC 3
    expect(result!.functions[0].cyclomatic).toBe(3);
  });

  it("handles class property arrow functions", () => {
    const result = analyze(`
      class Foo {
        bar = () => { if (x) {} };
      }
    `);
    expect(result!.functions).toHaveLength(1);
    expect(result!.functions[0].name).toBe("Foo.bar");
  });
});
