/**
 * AST-Based Complexity Analysis
 *
 * Implements industry-standard code complexity metrics using TypeScript AST:
 * - Cyclomatic Complexity (McCabe V(G)) — decision point counting
 * - Cognitive Complexity (SonarQube) — mental effort with nesting penalties
 * - Halstead Metrics — operator/operand counting for volume, difficulty, effort
 * - Maintainability Index — composite metric (0-100, higher = easier to maintain)
 *
 * All metrics are computed at function-level granularity using
 * @typescript-eslint/typescript-estree for accurate AST parsing.
 *
 * References:
 * - McCabe (1976): "A Complexity Measure" IEEE TSE
 * - SonarSource: "Cognitive Complexity" whitepaper
 * - Halstead (1977): "Elements of Software Science"
 * - SEI: Maintainability Index formula
 *
 * @module scanners/ast-complexity
 */

import { parse } from "@typescript-eslint/typescript-estree";
import type { TSESTree } from "@typescript-eslint/typescript-estree";

// ============================================================================
// Types
// ============================================================================

/** Halstead software science metrics */
export interface HalsteadMetrics {
  /** n1: distinct operators */
  operators: number;
  /** n2: distinct operands */
  operands: number;
  /** N1: total operator occurrences */
  totalOperators: number;
  /** N2: total operand occurrences */
  totalOperands: number;
  /** n = n1 + n2 */
  vocabulary: number;
  /** N = N1 + N2 */
  length: number;
  /** V = N * log2(n) */
  volume: number;
  /** D = (n1/2) * (N2/n2) */
  difficulty: number;
  /** E = D * V */
  effort: number;
  /** B = V / 3000 */
  estimatedBugs: number;
}

/** Per-function complexity metrics */
export interface FunctionComplexity {
  /** Function/method name */
  name: string;
  /** Start line number (1-based) */
  startLine: number;
  /** End line number (1-based) */
  endLine: number;
  /** McCabe cyclomatic complexity V(G) */
  cyclomatic: number;
  /** SonarQube cognitive complexity */
  cognitive: number;
  /** Halstead metrics */
  halstead: HalsteadMetrics;
  /** Maintainability Index (0-100) */
  maintainabilityIndex: number;
  /** Lines of code in function body */
  loc: number;
}

/** File-level complexity results */
export interface FileASTComplexity {
  /** Relative file path */
  path: string;
  /** Per-function complexity breakdown */
  functions: FunctionComplexity[];
  /** Sum of all function cyclomatic complexities */
  fileCyclomatic: number;
  /** Sum of all function cognitive complexities */
  fileCognitive: number;
  /** Average maintainability index across functions */
  avgMaintainability: number;
  /** Total lines of code */
  loc: number;
}

// ============================================================================
// AST Traversal
// ============================================================================

/** Walk an AST node tree, calling visitor for each node */
function walkAST(node: TSESTree.Node, visitor: (node: TSESTree.Node) => void): void {
  visitor(node);
  for (const key in node) {
    const value = (node as Record<string, unknown>)[key];
    if (value && typeof value === "object") {
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child && typeof child === "object" && "type" in child) {
            walkAST(child as TSESTree.Node, visitor);
          }
        }
      } else if ("type" in value) {
        walkAST(value as TSESTree.Node, visitor);
      }
    }
  }
}

/** Extract function name from an AST node */
function getFunctionName(node: TSESTree.Node): string {
  switch (node.type) {
    case "FunctionDeclaration":
      return (node as TSESTree.FunctionDeclaration).id?.name ?? "<anonymous>";
    case "MethodDefinition": {
      const md = node as TSESTree.MethodDefinition;
      if (md.key.type === "Identifier") return md.key.name;
      if (md.key.type === "Literal") return String(md.key.value);
      return "<computed>";
    }
    case "ArrowFunctionExpression":
    case "FunctionExpression": {
      // Try to get name from parent VariableDeclarator or Property
      return "<anonymous>";
    }
    default:
      return "<unknown>";
  }
}

/** Get the body node of a function for analysis */
function getFunctionBody(node: TSESTree.Node): TSESTree.Node | null {
  switch (node.type) {
    case "FunctionDeclaration":
    case "FunctionExpression":
    case "ArrowFunctionExpression":
      return (node as TSESTree.FunctionDeclaration).body;
    case "MethodDefinition": {
      const md = node as TSESTree.MethodDefinition;
      return md.value.body;
    }
    default:
      return null;
  }
}

// ============================================================================
// Cyclomatic Complexity (McCabe)
// ============================================================================

/**
 * Calculates cyclomatic complexity via AST node counting.
 * V(G) = 1 + number of decision points
 */
function calculateCyclomaticAST(body: TSESTree.Node): number {
  let complexity = 1; // Base path

  walkAST(body, (node) => {
    switch (node.type) {
      case "IfStatement":
      case "ConditionalExpression":
      case "ForStatement":
      case "ForInStatement":
      case "ForOfStatement":
      case "WhileStatement":
      case "DoWhileStatement":
      case "CatchClause":
        complexity++;
        break;
      case "SwitchCase":
        // Default case doesn't add a decision point
        if ((node as TSESTree.SwitchCase).test !== null) {
          complexity++;
        }
        break;
      case "LogicalExpression": {
        const op = (node as TSESTree.LogicalExpression).operator;
        if (op === "&&" || op === "||" || op === "??") {
          complexity++;
        }
        break;
      }
      // Optional chaining: each ?. operator creates a branch (ESLint 2024)
      // Count individual optional members/calls, not the ChainExpression wrapper
      case "MemberExpression":
        if ((node as TSESTree.MemberExpression).optional) {
          complexity++;
        }
        break;
      case "CallExpression":
        if ((node as TSESTree.CallExpression).optional) {
          complexity++;
        }
        break;
    }
  });

  return complexity;
}

// ============================================================================
// Cognitive Complexity (SonarQube)
// ============================================================================

/**
 * Calculates cognitive complexity per the SonarQube specification.
 * Accounts for nesting depth, flow-breaking constructs, and recursion.
 */
function calculateCognitiveAST(body: TSESTree.Node, functionName: string): number {
  let complexity = 0;

  function walk(node: TSESTree.Node, nesting: number): void {
    switch (node.type) {
      case "IfStatement": {
        const ifNode = node as TSESTree.IfStatement;
        complexity += 1 + nesting; // increment + nesting penalty
        walk(ifNode.consequent, nesting + 1);
        if (ifNode.alternate) {
          if (ifNode.alternate.type === "IfStatement") {
            // else if: +1 but no nesting increase
            complexity += 1;
            const elseIf = ifNode.alternate as TSESTree.IfStatement;
            walk(elseIf.consequent, nesting + 1);
            if (elseIf.alternate) {
              walk(elseIf.alternate, nesting);
            }
          } else {
            // else: +1, no nesting increase
            complexity += 1;
            walk(ifNode.alternate, nesting + 1);
          }
        }
        return; // Don't walk children again
      }

      case "ForStatement":
      case "ForInStatement":
      case "ForOfStatement":
      case "WhileStatement":
      case "DoWhileStatement":
        complexity += 1 + nesting;
        walkChildren(node, nesting + 1);
        return;

      case "SwitchStatement":
        complexity += 1 + nesting;
        walkChildren(node, nesting + 1);
        return;

      case "CatchClause":
        complexity += 1 + nesting;
        walkChildren(node, nesting + 1);
        return;

      case "ConditionalExpression":
        complexity += 1 + nesting;
        walkChildren(node, nesting + 1);
        return;

      case "LogicalExpression": {
        // SonarSource spec: a sequence of the SAME operator counts as +1.
        // Only increment when the operator changes or at the start of a chain.
        // In a left-associative AST, `a && b && c` is ((a && b) && c).
        // Count +1 only if left child is NOT a LogicalExpression with same operator.
        const logNode = node as TSESTree.LogicalExpression;
        const op = logNode.operator;
        if (op === "&&" || op === "||" || op === "??") {
          const leftIsSameOp =
            logNode.left.type === "LogicalExpression" &&
            (logNode.left as TSESTree.LogicalExpression).operator === op;
          if (!leftIsSameOp) {
            complexity += 1;
          }
        }
        walkChildren(node, nesting);
        return;
      }

      case "BreakStatement":
      case "ContinueStatement": {
        const stmt = node as TSESTree.BreakStatement | TSESTree.ContinueStatement;
        if (stmt.label) {
          complexity += 1; // Break/continue to label
        }
        return;
      }

      // Nested functions increase nesting
      case "FunctionDeclaration":
      case "FunctionExpression":
      case "ArrowFunctionExpression":
        walkChildren(node, nesting + 1);
        return;

      case "CallExpression": {
        // Recursion detection
        const call = node as TSESTree.CallExpression;
        if (
          call.callee.type === "Identifier" &&
          call.callee.name === functionName
        ) {
          complexity += 1;
        }
        walkChildren(node, nesting);
        return;
      }

      default:
        walkChildren(node, nesting);
    }
  }

  function walkChildren(node: TSESTree.Node, nesting: number): void {
    for (const key in node) {
      if (key === "parent") continue;
      const value = (node as Record<string, unknown>)[key];
      if (value && typeof value === "object") {
        if (Array.isArray(value)) {
          for (const child of value) {
            if (child && typeof child === "object" && "type" in child) {
              walk(child as TSESTree.Node, nesting);
            }
          }
        } else if ("type" in value) {
          walk(value as TSESTree.Node, nesting);
        }
      }
    }
  }

  walk(body, 0);
  return complexity;
}

// ============================================================================
// Halstead Metrics
// ============================================================================

/** Nodes that count as operators in Halstead analysis */
const OPERATOR_TYPES = new Set([
  "BinaryExpression",
  "UnaryExpression",
  "UpdateExpression",
  "AssignmentExpression",
  "LogicalExpression",
  "ConditionalExpression",
]);

/** Keyword statements that count as operators */
const KEYWORD_OPERATORS = new Set([
  "IfStatement",
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "WhileStatement",
  "DoWhileStatement",
  "SwitchStatement",
  "SwitchCase",
  "BreakStatement",
  "ContinueStatement",
  "ReturnStatement",
  "ThrowStatement",
  "TryStatement",
  "CatchClause",
  "VariableDeclaration",
  "NewExpression",
  "DeleteExpression",
  "TypeofExpression",
  "VoidExpression",
  "YieldExpression",
  "AwaitExpression",
  "SpreadElement",
]);

/**
 * Calculates Halstead metrics for a function body.
 * Counts distinct and total operators/operands.
 */
function calculateHalstead(body: TSESTree.Node): HalsteadMetrics {
  const operators = new Set<string>();
  const operands = new Set<string>();
  let totalOperators = 0;
  let totalOperands = 0;

  walkAST(body, (node) => {
    // Operators from expressions
    if (OPERATOR_TYPES.has(node.type)) {
      let op: string;
      switch (node.type) {
        case "BinaryExpression":
          op = (node as TSESTree.BinaryExpression).operator;
          break;
        case "UnaryExpression":
          op = (node as TSESTree.UnaryExpression).operator;
          break;
        case "UpdateExpression":
          op = (node as TSESTree.UpdateExpression).operator;
          break;
        case "AssignmentExpression":
          op = (node as TSESTree.AssignmentExpression).operator;
          break;
        case "LogicalExpression":
          op = (node as TSESTree.LogicalExpression).operator;
          break;
        case "ConditionalExpression":
          op = "?:";
          break;
        default:
          op = node.type;
      }
      operators.add(op);
      totalOperators++;
    }

    // Operators from keyword statements
    if (KEYWORD_OPERATORS.has(node.type)) {
      operators.add(node.type);
      totalOperators++;
    }

    // Member access operators
    if (node.type === "MemberExpression") {
      const me = node as TSESTree.MemberExpression;
      operators.add(me.optional ? "?." : ".");
      totalOperators++;
    }

    // Arrow function operator
    if (node.type === "ArrowFunctionExpression") {
      operators.add("=>");
      totalOperators++;
    }

    // Function call operator
    if (node.type === "CallExpression") {
      operators.add("()");
      totalOperators++;
    }

    // Operands: identifiers
    if (node.type === "Identifier") {
      operands.add((node as TSESTree.Identifier).name);
      totalOperands++;
    }

    // Operands: literals
    if (node.type === "Literal") {
      const lit = node as TSESTree.Literal;
      operands.add(String(lit.value));
      totalOperands++;
    }

    // Operands: template literals
    if (node.type === "TemplateLiteral") {
      operands.add("<template>");
      totalOperands++;
    }
  });

  const n1 = operators.size || 1; // Avoid division by zero
  const n2 = operands.size || 1;
  const N1 = totalOperators;
  const N2 = totalOperands;

  const vocabulary = n1 + n2;
  const length = N1 + N2;
  const volume = length > 0 && vocabulary > 0
    ? length * Math.log2(vocabulary)
    : 0;
  const difficulty = n2 > 0 ? (n1 / 2) * (N2 / n2) : 0;
  const effort = difficulty * volume;
  const estimatedBugs = volume / 3000;

  return {
    operators: n1,
    operands: n2,
    totalOperators: N1,
    totalOperands: N2,
    vocabulary,
    length,
    volume: Math.round(volume * 100) / 100,
    difficulty: Math.round(difficulty * 100) / 100,
    effort: Math.round(effort * 100) / 100,
    estimatedBugs: Math.round(estimatedBugs * 1000) / 1000,
  };
}

// ============================================================================
// Maintainability Index
// ============================================================================

/**
 * Calculates Maintainability Index (0-100, higher = easier to maintain).
 * MI = max(0, (171 - 5.2 * ln(V) - 0.23 * G - 16.2 * ln(LOC)) * 100 / 171)
 */
function calculateMaintainabilityIndex(
  halsteadVolume: number,
  cyclomatic: number,
  loc: number,
): number {
  const V = Math.max(halsteadVolume, 1);
  const G = cyclomatic;
  const L = Math.max(loc, 1);

  const raw = 171 - 5.2 * Math.log(V) - 0.23 * G - 16.2 * Math.log(L);
  const normalized = Math.max(0, (raw * 100) / 171);
  return Math.round(normalized * 10) / 10;
}

// ============================================================================
// Function Discovery
// ============================================================================

/** Discover all function-like nodes at the top level and in classes */
function discoverFunctions(ast: TSESTree.Program): Array<{
  node: TSESTree.Node;
  name: string;
}> {
  const functions: Array<{ node: TSESTree.Node; name: string }> = [];

  for (const stmt of ast.body) {
    collectFunctionsFromNode(stmt, functions, null);
  }

  return functions;
}

function collectFunctionsFromNode(
  node: TSESTree.Node,
  result: Array<{ node: TSESTree.Node; name: string }>,
  parentName: string | null,
): void {
  switch (node.type) {
    case "FunctionDeclaration": {
      const fd = node as TSESTree.FunctionDeclaration;
      const name = fd.id?.name ?? "<anonymous>";
      result.push({ node, name });
      break;
    }

    case "VariableDeclaration": {
      const vd = node as TSESTree.VariableDeclaration;
      for (const decl of vd.declarations) {
        if (
          decl.init &&
          (decl.init.type === "ArrowFunctionExpression" ||
            decl.init.type === "FunctionExpression")
        ) {
          const name =
            decl.id.type === "Identifier" ? decl.id.name : "<destructured>";
          result.push({ node: decl.init, name });
        }
      }
      break;
    }

    case "ExportNamedDeclaration": {
      const end = node as TSESTree.ExportNamedDeclaration;
      if (end.declaration) {
        collectFunctionsFromNode(end.declaration, result, parentName);
      }
      break;
    }

    case "ExportDefaultDeclaration": {
      const edd = node as TSESTree.ExportDefaultDeclaration;
      if (
        edd.declaration.type === "FunctionDeclaration" ||
        edd.declaration.type === "ArrowFunctionExpression" ||
        edd.declaration.type === "FunctionExpression"
      ) {
        const name = getFunctionName(edd.declaration);
        result.push({ node: edd.declaration, name: name === "<anonymous>" ? "default" : name });
      } else if (edd.declaration.type === "ClassDeclaration") {
        collectFunctionsFromNode(edd.declaration, result, parentName);
      }
      break;
    }

    case "ClassDeclaration": {
      const cd = node as TSESTree.ClassDeclaration;
      const className = cd.id?.name ?? "<AnonymousClass>";
      for (const element of cd.body.body) {
        if (element.type === "MethodDefinition") {
          const md = element as TSESTree.MethodDefinition;
          const methodName =
            md.key.type === "Identifier" ? md.key.name : "<computed>";
          result.push({
            node: element,
            name: `${className}.${methodName}`,
          });
        }
        if (element.type === "PropertyDefinition") {
          const pd = element as TSESTree.PropertyDefinition;
          if (
            pd.value &&
            (pd.value.type === "ArrowFunctionExpression" ||
              pd.value.type === "FunctionExpression")
          ) {
            const propName =
              pd.key.type === "Identifier" ? pd.key.name : "<computed>";
            result.push({
              node: pd.value,
              name: `${className}.${propName}`,
            });
          }
        }
      }
      break;
    }
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Analyzes a TypeScript/JavaScript file for function-level complexity.
 *
 * @param content - File source code
 * @param filePath - Relative file path (for reporting)
 * @returns File complexity analysis or null on parse failure
 */
export function analyzeFileAST(
  content: string,
  filePath: string,
): FileASTComplexity | null {
  try {
    const ast = parse(content, {
      loc: true,
      range: true,
      comment: true,
      jsx: true,
    });

    const discovered = discoverFunctions(ast);

    if (discovered.length === 0) {
      // No functions found — treat the entire file as one unit
      const loc = content.split("\n").length;
      return {
        path: filePath,
        functions: [],
        fileCyclomatic: 1,
        fileCognitive: 0,
        avgMaintainability: 100,
        loc,
      };
    }

    const functions: FunctionComplexity[] = [];

    for (const { node, name } of discovered) {
      const body = getFunctionBody(node);
      if (!body) continue;

      const startLine = node.loc?.start.line ?? 0;
      const endLine = node.loc?.end.line ?? 0;
      const loc = Math.max(endLine - startLine + 1, 1);

      const cyclomatic = calculateCyclomaticAST(body);
      const cognitive = calculateCognitiveAST(body, name);
      const halstead = calculateHalstead(body);
      const mi = calculateMaintainabilityIndex(halstead.volume, cyclomatic, loc);

      functions.push({
        name,
        startLine,
        endLine,
        cyclomatic,
        cognitive,
        halstead,
        maintainabilityIndex: mi,
        loc,
      });
    }

    const fileCyclomatic = functions.reduce((s, f) => s + f.cyclomatic, 0);
    const fileCognitive = functions.reduce((s, f) => s + f.cognitive, 0);
    const avgMI =
      functions.length > 0
        ? Math.round(
            (functions.reduce((s, f) => s + f.maintainabilityIndex, 0) /
              functions.length) *
              10,
          ) / 10
        : 100;

    return {
      path: filePath,
      functions,
      fileCyclomatic,
      fileCognitive,
      avgMaintainability: avgMI,
      loc: content.split("\n").length,
    };
  } catch {
    // AST parsing failed — return null for fallback
    return null;
  }
}
