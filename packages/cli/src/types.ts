/**
 * Type definitions for hashmark
 *
 * This file contains all TypeScript interfaces used throughout the codebase.
 * These types define the structure of data returned by scanners and used
 * in the generation process.
 */

// ============================================================================
// Component Types
// ============================================================================

/** Complexity metrics for a React component */
export interface ComponentComplexity {
  /** Number of props the component accepts */
  propCount: number;
  /** Number of import statements in the file */
  importCount: number;
  /** Total lines of code (non-empty) */
  lineCount: number;
  /** Whether the component uses useState or useReducer */
  hasState: boolean;
  /** Whether the component uses useEffect */
  hasEffects: boolean;
  /** Whether the component uses useContext */
  hasContext: boolean;
}

/** A React component discovered in the codebase */
export interface Component {
  /** Display name of the component (e.g., "Button") */
  name: string;
  /** Relative file path (e.g., "src/components/ui/button.tsx") */
  path: string;
  /** Import path for use in code (e.g., "@/components/ui/button") */
  importPath: string;
  /** List of exported names from this file */
  exports: string[];
  /** Prop names extracted from Props interface/type */
  props?: string[];
  /** JSDoc description if available */
  description?: string;
  /** Complexity metrics */
  complexity?: ComponentComplexity;
}

/** CVA (class-variance-authority) variant configuration */
export interface ComponentVariant {
  /** Component name this variant belongs to */
  component: string;
  /** Variant options (e.g., { variant: ["default", "destructive"], size: ["sm", "md", "lg"] }) */
  variants: Record<string, string[]>;
  /** Default variant values */
  defaultVariants?: Record<string, string>;
}

/** Component import dependencies */
export interface ComponentDependency {
  /** Component name */
  component: string;
  /** File path */
  path: string;
  /** Categorized imports */
  imports: {
    /** Utility imports (cn, clsx, etc.) */
    utilities: string[];
    /** Design system imports (mode, tokens, etc.) */
    designSystem: string[];
    /** Radix UI primitives */
    radix: string[];
    /** Internal project imports */
    internal: string[];
    /** External package imports */
    external: string[];
  };
}

// ============================================================================
// Design System Types
// ============================================================================

/** CSS design tokens extracted from the codebase */
export interface Tokens {
  /** Color tokens (CSS variable name -> value) */
  colors: Record<string, string>;
  /** Spacing tokens */
  spacing: Record<string, string>;
  /** Border radius tokens */
  radius: Record<string, string>;
  /** Font family names */
  fonts: string[];
}

/** Utility functions and libraries detected */
export interface Utilities {
  /** Whether cn() class merging utility exists */
  hasCn: boolean;
  /** Path to cn utility (e.g., "@/lib/utils") */
  cnPath?: string;
  /** Whether mode/design-system exists */
  hasMode: boolean;
  /** Path to mode export */
  modePath?: string;
  /** Whether shadcn/ui is installed */
  hasShadcn: boolean;
  /** List of @radix-ui packages installed */
  radixPackages: string[];
  /** Whether CVA (class-variance-authority) is used */
  hasCva: boolean;
  /** Other custom utilities found */
  customUtils: string[];
}

// ============================================================================
// Framework & Project Types
// ============================================================================

/** Detected framework information */
export interface Framework {
  /** Framework name (e.g., "Next.js", "Remix", "Vite", "Django", "Gin", "Axum") */
  name: string;
  /** Framework version */
  version?: string;
  /** Router type for Next.js ("App Router" or "Pages Router") */
  router?: string;
  /** Primary language ("TypeScript" | "JavaScript" | "Python" | "Go" | "Rust" | "Ruby" | "Java" | "Kotlin" | "PHP" | "C#" | "Swift") */
  language: string;
  /** Styling solution (e.g., "Tailwind CSS") */
  styling?: string;
  /** Key dependency versions */
  versions?: {
    react?: string;
    typescript?: string;
    tailwindcss?: string;
    prisma?: string;
    node?: string;
    go?: string;
    python?: string;
    ruby?: string;
    java?: string;
    php?: string;
    rust?: string;
  };
}

/** npm scripts from package.json */
export interface Commands {
  /** Development server command */
  dev?: string;
  /** Production build command */
  build?: string;
  /** Test runner command */
  test?: string;
  /** Linting command */
  lint?: string;
  /** Code formatting command */
  format?: string;
  /** TypeScript type checking command */
  typecheck?: string;
  /** Database-related commands */
  db?: Record<string, string>;
  /** Other custom commands */
  custom: Record<string, string>;
}

/** Existing documentation files in the project */
export interface ExistingContext {
  /** Whether CLAUDE.md exists */
  hasClaudeMd: boolean;
  /** Path to CLAUDE.md if found */
  claudeMdPath?: string;
  /** Content of CLAUDE.md */
  claudeMdContent?: string;
  /** Whether AGENTS.md already exists */
  hasAgentsMd: boolean;
  /** Path to existing AGENTS.md */
  agentsMdPath?: string;
  /** Whether .ai/ folder exists */
  hasAiFolder: boolean;
  /** Files in .ai/ folder */
  aiFiles: string[];
  /** Whether .cursorrules exists */
  hasCursorRules: boolean;
  /** Content of .cursorrules if found */
  cursorRulesContent?: string;
  /** Whether .windsurfrules exists */
  hasWindsurfRules: boolean;
  /** Content of .windsurfrules if found */
  windsurfRulesContent?: string;
  /** Whether .clinerules exists */
  hasClineRules: boolean;
  /** Content of .clinerules if found */
  clineRulesContent?: string;
  /** Whether GEMINI.md exists */
  hasGeminiMd: boolean;
  /** Content of GEMINI.md if found */
  geminiMdContent?: string;
  /** Whether .github/copilot-instructions.md exists */
  hasCopilotInstructions: boolean;
  /** Content of copilot-instructions.md if found */
  copilotInstructionsContent?: string;
  /** Whether .cursor/rules/*.mdc files exist */
  hasCursorMdc: boolean;
  /** List of .cursor/rules/*.mdc file names */
  cursorMdcFiles: string[];
  /** Content of .cursor/rules/*.mdc files keyed by filename */
  cursorMdcContent?: Record<string, string>;
  /** Merged rules extracted from all existing rule files */
  allRules: string[];
}

/** Environment variable definition */
export interface EnvVar {
  /** Variable name (e.g., "DATABASE_URL") */
  name: string;
  /** Whether the variable is required */
  required: boolean;
  /** Whether a default value is provided */
  hasDefault: boolean;
  /** Description from comments */
  description?: string;
  /** Category (e.g., "database", "auth") */
  category?: string;
}

// ============================================================================
// API & Database Types
// ============================================================================

/** API route information */
export interface ApiRoute {
  /** Route path (e.g., "/api/users/[id]") */
  path: string;
  /** HTTP methods (GET, POST, etc.) */
  methods: string[];
  /** Whether authentication is required */
  isProtected: boolean;
  /** Route description if available */
  description?: string;
  /** Request body schema */
  requestSchema?: ApiSchema;
  /** Response schema */
  responseSchema?: ApiSchema;
  /** Query parameters schema */
  querySchema?: ApiSchema;
}

/** API schema information */
export interface ApiSchema {
  /** Schema source (zod, typescript, graphql, or unknown) */
  source: "zod" | "typescript" | "graphql" | "unknown";
  /** Type/schema name if defined */
  name?: string;
  /** Extracted fields with types */
  fields: ApiField[];
  /** Whether schema is required */
  isRequired?: boolean;
}

/** API field information */
export interface ApiField {
  /** Field name */
  name: string;
  /** Field type (string, number, boolean, object, etc.) */
  type: string;
  /** Whether field is optional */
  isOptional: boolean;
  /** Validation rules (min, max, email, etc.) */
  validations?: string[];
  /** Nested fields for objects */
  nested?: ApiField[];
}

/** Database model definition */
export interface DatabaseModel {
  /** Model/table name */
  name: string;
  /** Field/column names */
  fields: string[];
  /** Relation names to other models */
  relations: string[];
}

/** Database schema information */
export interface DatabaseSchema {
  /** ORM provider */
  provider: "prisma" | "drizzle" | "unknown";
  /** List of models/tables */
  models: DatabaseModel[];
}

// ============================================================================
// Custom Hook Types
// ============================================================================

/** Custom React hook information */
export interface Hook {
  /** Hook name (e.g., "useAuth") */
  name: string;
  /** File path */
  path: string;
  /** Import path */
  importPath: string;
  /** Whether this hook requires client-side rendering */
  isClientOnly: boolean;
}

/** AI Automation Hook (inspired by Latent-K) */
export interface LatentHook {
  /** Event that triggers the hook (e.g., "session_start", "file_edit", "task_complete") */
  event: string;
  /** Command to execute (e.g., "npm run lint") */
  command: string;
  /** Description of what the hook does */
  description?: string;
  /** Optional file pattern this hook applies to */
  pattern?: string;
}

// ============================================================================
// Pattern Detection Types
// ============================================================================

/** Detected code patterns and libraries */
export interface DetectedPatterns {
  /** react-hook-form installed */
  hasReactHookForm: boolean;
  /** zod validation library installed */
  hasZod: boolean;
  /** Form handling pattern description */
  formPattern?: string;
  /** Zustand state management */
  hasZustand: boolean;
  /** Redux state management */
  hasRedux: boolean;
  /** TanStack Query (react-query) */
  hasTanstackQuery: boolean;
  /** tRPC installed */
  hasTrpc: boolean;
  /** SWR data fetching */
  hasSwr: boolean;
  /** Radix Slot component usage */
  hasRadixSlot: boolean;
  /** React.forwardRef usage */
  hasForwardRef: boolean;
  /** Vitest testing framework */
  hasVitest: boolean;
  /** Jest testing framework */
  hasJest: boolean;
  /** Playwright E2E testing */
  hasPlaywright: boolean;
  /** Human-readable pattern descriptions */
  patterns: string[];
}

/** Anti-pattern with wrong/right examples */
export interface AntiPattern {
  /** Pattern title */
  title: string;
  /** Wrong code example */
  wrong: string;
  /** Correct code example */
  right: string;
  /** Explanation of why this matters */
  reason: string;
}

/** Anti-patterns analysis result */
export interface AntiPatternsResult {
  /** Detected anti-patterns */
  patterns: AntiPattern[];
  /** Warning messages */
  warnings: string[];
}

// ============================================================================
// File System Types
// ============================================================================

/** File statistics */
export interface FileStats {
  /** Total number of files scanned */
  totalFiles: number;
  /** Total lines of code */
  totalLines: number;
  /** Total size in bytes */
  totalSize: number;
  /** Largest files by line count */
  largestFiles: { path: string; lines: number }[];
  /** File count by extension */
  filesByType: Record<string, number>;
}

/** File tree node for visualization */
export interface FileTreeNode {
  /** File or directory name */
  name: string;
  /** Node type */
  type: "file" | "directory";
  /** Child nodes for directories */
  children?: FileTreeNode[];
  /** File count for directories */
  fileCount?: number;
}

/** Complete file tree */
export interface FileTree {
  /** Root node */
  root: FileTreeNode;
  /** Total file count */
  totalFiles: number;
  /** Total directory count */
  totalDirs: number;
}

/** Barrel export (index.ts re-exports) */
export interface BarrelExport {
  /** File path */
  path: string;
  /** Import path */
  importPath: string;
  /** Exported names */
  exports: string[];
}

// ============================================================================
// Import Analysis Types
// ============================================================================

/** Import graph analysis results */
export interface ImportGraph {
  /** Map of file path to import info */
  files: Map<string, any>;
  /** Most imported files (hubs) */
  hubFiles: Array<{ file: string; importedByCount: number }>;
  /** Circular dependency cycles */
  circularDeps: Array<{ cycle: string[] }>;
  /** External package usage counts */
  externalDeps: Map<string, number>;
  /** Files that are never imported (potentially dead code) */
  unusedFiles: string[];
}

// ============================================================================
// TypeScript Types
// ============================================================================

/** Exported TypeScript type/interface */
export interface TypeExport {
  /** Type name */
  name: string;
  /** Type kind */
  kind: "interface" | "type" | "enum";
  /** Source file */
  file: string;
  /** Property names for interfaces */
  properties?: string[];
  /** Extended type */
  extends?: string;
  /** JSDoc description */
  description?: string;
}

/** TypeScript type scan results */
export interface TypeScanResult {
  /** All exported types */
  types: TypeExport[];
  /** Props types (ending in Props) */
  propsTypes: TypeExport[];
  /** API-related types */
  apiTypes: TypeExport[];
  /** Model/entity types */
  modelTypes: TypeExport[];
}

// ============================================================================
// Testing & Security Types
// ============================================================================

/** Test coverage analysis */
export interface TestCoverage {
  /** Detected test framework */
  testFramework: "vitest" | "jest" | "playwright" | "testing-library" | "none";
  /** All test file paths */
  testFiles: string[];
  /** Components that have tests */
  testedComponents: string[];
  /** Components without tests */
  untestedComponents: string[];
  /** Coverage percentage (0-100) */
  coverage: number;
}

/** Security audit results */
export interface SecurityAudit {
  /** Vulnerability counts by severity */
  vulnerabilities: {
    critical: number;
    high: number;
    moderate: number;
    low: number;
    info: number;
    total: number;
  };
  /** Outdated package information */
  outdatedPackages: Array<{
    name: string;
    current: string;
    wanted: string;
    latest: string;
  }>;
  /** Whether a lockfile exists */
  hasLockfile: boolean;
  /** Error message if audit failed */
  auditError?: string;
}

// ============================================================================
// AI Configuration & Complexity
// ============================================================================

/** Complexity level for files or sections */
export type ComplexityLevel = "low" | "medium" | "high";

/** File complexity information */
export interface FileComplexity {
  /** File path */
  path: string;
  /** Lines of code */
  lines: number;
  /** Complexity score (0-100) */
  score: number;
  /** Complexity level */
  level: ComplexityLevel;
  /** Reasons for complexity */
  reasons: string[];
  /** Function-level complexity breakdown (from AST analysis) */
  functions?: FunctionComplexity[];
  /** File-level Halstead metrics */
  halstead?: HalsteadMetrics;
  /** Maintainability Index (0-100, higher = easier to maintain) */
  maintainabilityIndex?: number;
}

/** Area-based complexity (e.g., "API Routes", "Components") */
export interface AreaComplexity {
  /** Area name */
  name: string;
  /** Complexity level */
  level: ComplexityLevel;
  /** File count */
  fileCount: number;
  /** Average complexity score */
  avgScore: number;
  /** Characteristics */
  characteristics: string[];
}

/** AI effort/resource tier for provider-agnostic recommendations */
export type ModelTier = "minimal" | "standard" | "maximum";

/** AI configuration recommendations */
export interface AIRecommendations {
  /** Recommended model tier for simple tasks */
  simpleModel: ModelTier;
  /** Recommended model tier for complex tasks */
  complexModel: ModelTier;
  /** Whether to enable extended thinking */
  extendedThinkingRecommended: boolean;
  /** Areas categorized by complexity */
  areas: AreaComplexity[];
  /** Most complex files */
  complexFiles: FileComplexity[];
}

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

/** File-level complexity results from AST */
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

/** Per-file complexity snapshot for persistence */
export interface PersistedFileComplexity {
  path: string;
  avgCyclomatic: number;
  avgCognitive: number;
  avgMaintainability: number;
}

/** Persisted complexity state written to .hashmark/last-complexity.json */
export interface PersistedComplexity {
  generatedAt: string;
  files: PersistedFileComplexity[];
  avgCyclomatic: number;
  avgCognitive: number;
  avgMaintainability: number;
}

/** Delta between current and previous scan complexity */
export interface ComplexityDelta {
  /** positive = got more complex */
  avgCyclomaticDelta: number;
  /** positive = got more complex */
  avgCognitiveDelta: number;
  /** positive = improved (MI goes up when simpler) */
  maintainabilityDelta: number;
  trend: "improving" | "stable" | "degrading";
  topRegressions: Array<{ file: string; metric: string; delta: number }>;
}

/** AI-Readiness Score results */
export interface AiReadinessScore {
  total: number; // 0-100
  breakdown: {
    documentation: number; // 0-20
    typeSafety: number; // 0-20
    modularization: number; // 0-20
    testing: number; // 0-20
    context: number; // 0-20
  };
  recommendations: string[];
}

// ============================================================================
// Main Result Type
// ============================================================================

/** Git commit information */
export interface GitCommit {
  /** Short commit hash (7 chars) */
  hash: string;
  /** Commit date (YYYY-MM-DD) */
  date: string;
  /** Author name */
  author: string;
  /** Commit message (truncated to 80 chars) */
  message: string;
}

/** Git repository information */
export interface GitInfo {
  /** Recent commits */
  commits: GitCommit[];
  /** Current branch name */
  branch: string;
  /** Remote origin URL if configured */
  remoteUrl?: string;
}

/** Complete scan result containing all analysis data */
export interface ScanResult {
  /** React components */
  components: Component[];
  /** Design tokens */
  tokens: Tokens;
  /** Framework information */
  framework: Framework;
  /** Custom hooks */
  hooks: Hook[];
  /** Utility detection */
  utilities: Utilities;
  /** npm scripts */
  commands: Commands;
  /** Existing documentation */
  existingContext: ExistingContext;
  /** CVA variants */
  variants: ComponentVariant[];
  /** API routes */
  apiRoutes: ApiRoute[];
  /** Environment variables */
  envVars: EnvVar[];
  /** Code patterns */
  patterns: DetectedPatterns;
  /** Database schema */
  database: DatabaseSchema | null;
  /** File statistics */
  stats: FileStats;
  /** Barrel exports */
  barrels: BarrelExport[];
  /** Component dependencies */
  dependencies: ComponentDependency[];
  /** AI automation hooks */
  latentHooks: LatentHook[];
  /** AI readiness score */
  aiReadiness?: AiReadinessScore;
  /** Semantic relationships */
  relationships?: {
    componentToHooks: Record<string, string[]>;
    apiToModels: Record<string, string[]>;
  };
  /** File tree (optional) */
  fileTree?: FileTree;
  /** Import graph (optional) */
  importGraph?: ImportGraph;
  /** TypeScript exports (optional) */
  typeExports?: TypeScanResult;
  /** Anti-patterns (optional) */
  antiPatterns?: AntiPatternsResult;
  /** Test coverage (optional) */
  testCoverage?: TestCoverage;
  /** Security audit (optional) */
  securityAudit?: SecurityAudit;
  /** AI configuration recommendations (optional) */
  aiRecommendations?: AIRecommendations;
  /** GraphQL schemas (optional) */
  graphqlSchemas?: Map<string, ApiSchema>;
  /** Git log and diff info (optional) */
  git?: GitInfo | null;
  /** Complexity delta vs last scan (optional) */
  complexityDelta?: ComplexityDelta | null;
  /** Context validation results (TypeScript, lint, build, tests) */
  contextValidation?: import("./scanners/context-validator.js").ContextValidation;
}
