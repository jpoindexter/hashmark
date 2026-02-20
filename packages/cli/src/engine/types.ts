import type { Framework, Utilities } from "../types.js";

/**
 * Context provided to every scanner during the traversal
 */
export interface ScannerContext {
  cwd: string;
  framework: Framework;
  utilities: Utilities;
  excludePatterns: string[];
  options?: any;
}

/**
 * The base interface for all scanner plugins in the Single-Pass Engine.
 * Instead of each scanner doing its own I/O, the Engine reads the file
 * and passes the content to matching plugins.
 */
export interface ScannerPlugin<T = any> {
  /** Unique name of the scanner */
  name: string;
  
  /** 
   * Glob patterns this scanner is interested in.
   * If empty, it won't receive file events but can still run in setup/finalize.
   */
  filePatterns: string[];

  /** Called once before the file traversal starts */
  setup?(context: ScannerContext): Promise<void> | void;

  /** 
   * Called for every file matching the filePatterns.
   * content is provided so the plugin doesn't need to read from disk.
   */
  onFile?(path: string, content: string, context: ScannerContext): Promise<void> | void;

  /** Called after the traversal is complete to perform aggregate analysis */
  finalize?(context: ScannerContext, results?: Record<string, any>): Promise<void> | void;

  /** Returns the final analysis results for this plugin */
  getResult(): T;
}
