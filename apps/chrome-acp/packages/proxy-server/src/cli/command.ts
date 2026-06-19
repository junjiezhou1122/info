import { buildCommand, numberParser } from "@stricli/core";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { LocalContext } from "./context.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CHROME_ACP_ROOT = resolve(__dirname, "../../../..");

function loadEnvFile(file: string): void {
  if (!existsSync(file)) return;
  const text = readFileSync(file, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    const rawValue = match[2];
    if (!key || rawValue === undefined) continue;
    if (process.env[key] !== undefined) continue;
    process.env[key] = unquoteEnvValue(rawValue.trim());
  }
}

function unquoteEnvValue(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function loadChromeAcpEnv(cwd: string): void {
  const files = [
    join(cwd, ".env"),
    join(cwd, ".env.local"),
    join(cwd, "apps/chrome-acp/.env"),
    join(cwd, "apps/chrome-acp/.env.local"),
    join(CHROME_ACP_ROOT, ".env"),
    join(CHROME_ACP_ROOT, ".env.local"),
  ];
  for (const file of [...new Set(files.map(file => resolve(file)))]) {
    loadEnvFile(file);
  }
}

export const command = buildCommand({
  docs: {
    brief: "Start the ACP proxy server",
    fullDescription:
      "Starts a WebSocket proxy server that bridges Chrome extensions to ACP agents. " +
      "The agent command is spawned as a subprocess and communicates via stdin/stdout.\n\n" +
      "Use -- to pass arguments to the agent:\n" +
      "  acp-proxy /path/to/agent -- --verbose --model gpt-4\n\n" +
      "For remote access, set ACP_AUTH_TOKEN environment variable or let it auto-generate.",
  },
  parameters: {
    flags: {
      port: {
        kind: "parsed",
        parse: numberParser,
        brief: "Port to listen on",
        default: "9315",
      },
      host: {
        kind: "parsed",
        parse: String,
        brief: "Host to bind to (use 0.0.0.0 for remote access)",
        default: "localhost",
      },
      debug: {
        kind: "boolean",
        brief: "Enable debug logging to file",
        default: false,
      },
      "no-auth": {
        kind: "boolean",
        brief: "DANGEROUS: Disable authentication (not recommended)",
        default: false,
      },
      termux: {
        kind: "boolean",
        brief: "Auto-launch PWA via Termux (finds and opens the ACP WebAPK)",
        default: false,
      },
      https: {
        kind: "boolean",
        brief: "Enable HTTPS with auto-generated self-signed certificate (required for camera on mobile)",
        default: false,
      },
      "public-url": {
        kind: "parsed",
        parse: String,
        brief: "Public WebSocket URL for QR code (e.g., wss://example.com/ws)",
        optional: true,
      },
      cwd: {
        kind: "parsed",
        parse: String,
        brief: "Working directory for the spawned agent process. Defaults to the current shell cwd. The chrome-acp side panel may override this per session via session/new params.cwd.",
        optional: true,
      },
    },
    positional: {
      kind: "array",
      parameter: {
        brief: "Agent command and arguments (use -- before agent flags)",
        parse: String,
        placeholder: "command",
      },
      minimum: 1,
    },
  },
  func: async function (
    this: LocalContext,
    flags: { port: number; host: string; debug: boolean; "no-auth": boolean; termux: boolean; https: boolean; "public-url"?: string; cwd?: string },
    ...args: readonly string[]
  ) {
    const port = flags.port;
    const host = flags.host;
    const debug = flags.debug;
    const noAuth = flags["no-auth"];
    const termux = flags.termux;
    const https = flags.https;
    const publicUrl = flags["public-url"];
    const cliCwd = flags.cwd;
    const [command, ...agentArgs] = args;
    const cwd = cliCwd ?? process.cwd();

    loadChromeAcpEnv(cwd);
    const { applyMidsceneEnvDefaults } = await import("../mcp/midscene-config.js");
    applyMidsceneEnvDefaults();

    // Determine auth token
    // Priority: ACP_AUTH_TOKEN env var > auto-generate (unless --no-auth)
    let token: string | undefined;
    if (noAuth) {
      console.warn("⚠️  WARNING: Authentication disabled. This is dangerous for remote access!");
      token = undefined;
    } else {
      token = process.env.ACP_AUTH_TOKEN;
      if (!token) {
        // Auto-generate random token
        const { randomBytes } = await import("node:crypto");
        token = randomBytes(32).toString("hex");
      }
    }

    // Initialize logger
    const { initLogger } = await import("../logger.js");
    initLogger({ debug });

    // Import and run the server
    const { startServer } = await import("../server.js");
    await startServer({ port, host, command: command!, args: [...agentArgs], cwd, debug, token, termux, https, publicUrl });
  },
});
