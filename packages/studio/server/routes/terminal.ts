/**
 * /api/terminal — WebSocket PTY terminal with VSCode shell integration
 * Injects OSC 633 sequences via shell hooks for command tracking and CWD updates.
 * All paths passed via environment variables — never interpolated into shell scripts.
 */

import type { IncomingMessage, Server } from "http";
import os from "os";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";

type WebSocketMessage = { type: "input"; data: string } | { type: "resize"; cols: number; rows: number };

// OSC 633 sequence constants (VSCode shell integration protocol)
// A=prompt start, B=prompt end, C=command start, D=command done, E=command line, P=property
const OSC633_PROMPT_START = "\x1b]633;A\x07";
const OSC633_PROMPT_END   = "\x1b]633;B\x07";

// Zsh shell integration script — uses $STUDIO_ORIG_ZDOTDIR env var (never JS-interpolated)
const ZSH_INTEGRATION = `
# Studio shell integration (VSCode OSC 633 protocol)
__studio_preexec() {
  printf '\\033]633;C\\007'
  printf '\\033]633;E;%s\\007' "$1"
}
__studio_precmd() {
  local _exit=$?
  printf '\\033]633;D;%s\\007' "$_exit"
  printf '\\033]633;P;Cwd=%s\\007' "$PWD"
}
autoload -Uz add-zsh-hook
add-zsh-hook preexec __studio_preexec
add-zsh-hook precmd __studio_precmd
PS1=$'\\033]633;A\\007'$PS1$'\\033]633;B\\007'
`;

// Bash shell integration script — uses $STUDIO_ORIG_BASHRC env var (never JS-interpolated)
const BASH_INTEGRATION = `
# Studio shell integration (VSCode OSC 633 protocol)
__studio_preexec() {
  printf '\\033]633;C\\007'
  printf '\\033]633;E;%s\\007' "$BASH_COMMAND"
}
__studio_precmd() {
  local _exit=$?
  printf '\\033]633;D;%s\\007' "$_exit"
  printf '\\033]633;P;Cwd=%s\\007' "$PWD"
}
trap '__studio_preexec' DEBUG
PROMPT_COMMAND='__studio_precmd'\${PROMPT_COMMAND:+"; $PROMPT_COMMAND"}
PS1=$'\\033]633;A\\007'$PS1$'\\033]633;B\\007'
`;

/**
 * Create shell integration env + temp files for a given shell.
 * Returns augmented env and a cleanup function.
 * All path injection is via env vars — scripts contain only static references like $STUDIO_ORIG_ZDOTDIR.
 */
function setupShellIntegration(shell: string): {
  env: Record<string, string>;
  cleanup: () => void;
} {
  const baseEnv = process.env as Record<string, string>;

  if (shell.endsWith("zsh")) {
    const origZdotdir = process.env.ZDOTDIR ?? process.env.HOME ?? os.homedir();
    const tmpDir = mkdtempSync(join(os.tmpdir(), "studio-zsh-"));

    // .zshrc: source original then inject hooks — uses $STUDIO_ORIG_ZDOTDIR (env var, not interpolated)
    const zshrc = [
      "# source original rc if it exists",
      'if [[ -f "$STUDIO_ORIG_ZDOTDIR/.zshrc" ]]; then',
      '  source "$STUDIO_ORIG_ZDOTDIR/.zshrc"',
      "fi",
      ZSH_INTEGRATION,
    ].join("\n");

    writeFileSync(join(tmpDir, ".zshrc"), zshrc, "utf-8");

    return {
      env: {
        ...baseEnv,
        ZDOTDIR: tmpDir,
        STUDIO_ORIG_ZDOTDIR: origZdotdir,
      },
      cleanup: () => {
        try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      },
    };
  }

  if (shell.endsWith("bash")) {
    const origBashrc = process.env.HOME
      ? `${process.env.HOME}/.bashrc`
      : `${os.homedir()}/.bashrc`;
    const tmpDir = mkdtempSync(join(os.tmpdir(), "studio-bash-"));

    // BASH_ENV runs for every non-interactive bash; for interactive we use --init-file
    const bashEnvFile = join(tmpDir, "studio-init.bash");
    const bashrc = [
      "# source original rc — uses $STUDIO_ORIG_BASHRC env var",
      'if [[ -f "$STUDIO_ORIG_BASHRC" ]]; then',
      '  source "$STUDIO_ORIG_BASHRC"',
      "fi",
      BASH_INTEGRATION,
    ].join("\n");

    writeFileSync(bashEnvFile, bashrc, "utf-8");

    return {
      env: {
        ...baseEnv,
        BASH_ENV: bashEnvFile,
        STUDIO_ORIG_BASHRC: origBashrc,
      },
      cleanup: () => {
        try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      },
    };
  }

  // Unsupported shell — passthrough with no integration
  return {
    env: { ...baseEnv },
    cleanup: () => {},
  };
}

async function spawnPty(projectDir: string) {
  const shell = process.env.SHELL ?? (os.platform() === "win32" ? "cmd.exe" : "/bin/zsh");
  const { env, cleanup } = setupShellIntegration(shell);

  const pty = await import("node-pty");
  const proc = pty.spawn(shell, [], {
    name: "xterm-color",
    cols: 80,
    rows: 24,
    cwd: projectDir,
    env,
  });

  return { proc, cleanup };
}

export function attachTerminalWS(httpServer: Server, projectDir: string) {
  // Suppress unused-var warning — kept for documentation
  void OSC633_PROMPT_START;
  void OSC633_PROMPT_END;

  import("ws").then(({ WebSocketServer }) => {
    const wss = new WebSocketServer({ noServer: true });

    httpServer.on("upgrade", (request: IncomingMessage, socket, head) => {
      const url = request.url ?? "";
      if (!url.startsWith("/api/terminal/ws")) return;

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    });

    wss.on("connection", async (ws) => {
      let ptyProcess: Awaited<ReturnType<typeof spawnPty>> | null = null;

      try {
        ptyProcess = await spawnPty(projectDir);
      } catch (err) {
        ws.send(`\r\nFailed to start terminal: ${err}\r\n`);
        ws.close();
        return;
      }

      const { proc, cleanup } = ptyProcess;

      // PTY → WebSocket
      proc.onData((data) => {
        try { ws.send(data); } catch {}
      });

      proc.onExit(() => {
        cleanup();
        try { ws.close(); } catch {}
      });

      // WebSocket → PTY
      ws.on("message", (raw) => {
        const msg = raw.toString();
        try {
          const parsed = JSON.parse(msg) as WebSocketMessage;
          if (parsed.type === "resize" && parsed.cols && parsed.rows) {
            proc.resize(parsed.cols, parsed.rows);
            return;
          }
          if (parsed.type === "input" && parsed.data) {
            proc.write(parsed.data);
            return;
          }
        } catch {}
        proc.write(msg);
      });

      ws.on("close", () => {
        cleanup();
        proc.kill();
        ptyProcess = null;
      });

      ws.on("error", () => {
        cleanup();
        proc.kill();
        ptyProcess = null;
      });
    });
  });
}
