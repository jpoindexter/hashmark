/**
 * Tool definitions for the Anthropic Messages API.
 * These match Claude Code's built-in tools.
 */

export const TOOL_SCHEMAS = [
  {
    name: "bash",
    description: "Execute a bash command. Use for running tests, git operations, builds, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: { type: "string", description: "The bash command to execute" },
        timeout: { type: "number", description: "Timeout in ms (default 30000)" },
      },
      required: ["command"],
    },
  },
  {
    name: "read",
    description: "Read a file from the filesystem. Returns the file content.",
    input_schema: {
      type: "object" as const,
      properties: {
        file_path: { type: "string", description: "Absolute path to the file to read" },
        offset: { type: "number", description: "Line number to start reading from (0-based)" },
        limit: { type: "number", description: "Max number of lines to read" },
      },
      required: ["file_path"],
    },
  },
  {
    name: "write",
    description: "Write content to a file. Creates the file if it doesn't exist, overwrites if it does.",
    input_schema: {
      type: "object" as const,
      properties: {
        file_path: { type: "string", description: "Absolute path to the file to write" },
        content: { type: "string", description: "The content to write" },
      },
      required: ["file_path", "content"],
    },
  },
  {
    name: "edit",
    description: "Edit a file by replacing an exact string match with new content.",
    input_schema: {
      type: "object" as const,
      properties: {
        file_path: { type: "string", description: "Absolute path to the file" },
        old_string: { type: "string", description: "The exact text to replace" },
        new_string: { type: "string", description: "The replacement text" },
      },
      required: ["file_path", "old_string", "new_string"],
    },
  },
  {
    name: "glob",
    description: "Find files matching a glob pattern.",
    input_schema: {
      type: "object" as const,
      properties: {
        pattern: { type: "string", description: "Glob pattern (e.g. '**/*.ts')" },
        path: { type: "string", description: "Directory to search in" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "grep",
    description: "Search file contents with a regex pattern.",
    input_schema: {
      type: "object" as const,
      properties: {
        pattern: { type: "string", description: "Regex pattern to search for" },
        path: { type: "string", description: "File or directory to search in" },
      },
      required: ["pattern"],
    },
  },
] as const;

export type ToolName = (typeof TOOL_SCHEMAS)[number]["name"];
