/**
 * Generates the inline Node.js script that runs as an MCP stdio server.
 * Claude CLI spawns this via --mcp-config. It speaks JSON-RPC over
 * stdin/stdout and proxies tool calls to Studio's HTTP endpoints.
 */

/**
 * Returns the full JS source for the MCP bridge process.
 * The bridge implements the MCP protocol (initialize, tools/list,
 * tools/call) and forwards tool calls to our Hono server.
 */
export function generateBridgeScript(port: number, projectDir: string): string {
  // Inline script -- no imports, runs with bare `node -e`
  // Uses only Node builtins (http, readline, process)
  return `
const http = require("http");
const readline = require("readline");

const PORT = ${port};
const PROJECT_DIR = ${JSON.stringify(projectDir)};

const rl = readline.createInterface({ input: process.stdin, terminal: false });

function respond(id, result) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id, result });
  process.stdout.write("Content-Length: " + Buffer.byteLength(msg) + "\\r\\n\\r\\n" + msg);
}

function respondError(id, code, message) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });
  process.stdout.write("Content-Length: " + Buffer.byteLength(msg) + "\\r\\n\\r\\n" + msg);
}

function httpGet(path) {
  return new Promise((resolve, reject) => {
    const req = http.get("http://localhost:" + PORT + path, (res) => {
      let body = "";
      res.on("data", (c) => { body += c; });
      res.on("end", () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve({ raw: body }); }
      });
    });
    req.on("error", reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("timeout")); });
  });
}

const TOOLS = [
  {
    name: "GetWorkspaceDiff",
    description: "Get the current workspace diff -- all changes on current branch vs last commit, including uncommitted changes. Use this when the user refers to the workspace diff, PR diff, or all changes.",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string", description: "Optional: specific file path for a focused diff" },
        stat: { type: "boolean", description: "Return git diff --stat summary instead of full diff" }
      }
    }
  },
  {
    name: "GetTerminalOutput",
    description: "Read recent output from the running terminal. Use this to check dev server errors, build output, or test results.",
    inputSchema: {
      type: "object",
      properties: {
        maxLines: { type: "number", description: "Maximum lines to return (default 100)" }
      }
    }
  },
  {
    name: "GetFileContent",
    description: "Read the content of a file in the project. The path is relative to the project root.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path relative to project root" }
      },
      required: ["path"]
    }
  }
];

async function handleToolCall(name, args) {
  if (name === "GetWorkspaceDiff") {
    const params = new URLSearchParams();
    if (args.file) params.set("file", args.file);
    if (args.stat) params.set("stat", "true");
    const qs = params.toString();
    const data = await httpGet("/api/mcp/tools/diff" + (qs ? "?" + qs : ""));
    return data.diff ?? data.error ?? "No diff available";
  }
  if (name === "GetTerminalOutput") {
    const maxLines = args.maxLines || 100;
    const data = await httpGet("/api/mcp/tools/terminal?maxLines=" + maxLines);
    return data.output ?? data.error ?? "No terminal output available";
  }
  if (name === "GetFileContent") {
    if (!args.path) return "Error: path parameter is required";
    const data = await httpGet("/api/mcp/tools/file?path=" + encodeURIComponent(args.path));
    return data.content ?? data.error ?? "File not found";
  }
  return "Unknown tool: " + name;
}

// MCP uses Content-Length framed messages on stdio
let contentBuffer = "";
let expectedLength = -1;

process.stdin.on("data", (chunk) => {
  contentBuffer += chunk.toString();
  while (true) {
    if (expectedLength === -1) {
      const headerEnd = contentBuffer.indexOf("\\r\\n\\r\\n");
      if (headerEnd === -1) break;
      const header = contentBuffer.slice(0, headerEnd);
      const match = header.match(/Content-Length:\\s*(\\d+)/i);
      if (!match) { contentBuffer = contentBuffer.slice(headerEnd + 4); continue; }
      expectedLength = parseInt(match[1], 10);
      contentBuffer = contentBuffer.slice(headerEnd + 4);
    }
    if (contentBuffer.length < expectedLength) break;
    const msgStr = contentBuffer.slice(0, expectedLength);
    contentBuffer = contentBuffer.slice(expectedLength);
    expectedLength = -1;
    try {
      const msg = JSON.parse(msgStr);
      handleMessage(msg);
    } catch {}
  }
});

function handleMessage(msg) {
  const method = msg.method;
  const id = msg.id;

  if (method === "initialize") {
    respond(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "hashmark-studio", version: "0.1.0" }
    });
    return;
  }

  if (method === "notifications/initialized") {
    // Client ack -- no response needed
    return;
  }

  if (method === "tools/list") {
    respond(id, { tools: TOOLS });
    return;
  }

  if (method === "tools/call") {
    const toolName = msg.params?.name;
    const toolArgs = msg.params?.arguments ?? {};
    handleToolCall(toolName, toolArgs)
      .then((result) => {
        const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
        respond(id, { content: [{ type: "text", text }] });
      })
      .catch((err) => {
        respondError(id, -32000, err.message || String(err));
      });
    return;
  }

  if (id !== undefined) {
    respondError(id, -32601, "Method not found: " + method);
  }
}

// Keep process alive
process.stdin.resume();
`.trim();
}
