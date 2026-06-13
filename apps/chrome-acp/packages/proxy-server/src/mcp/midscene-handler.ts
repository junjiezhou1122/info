import { AgentOverChromeBridge } from "@midscene/web/bridge-mode";
import type { McpToolCallResult } from "./types.js";

type VisionActArgs = {
  intent?: string;
  target?: string;
  text?: string;
  mode?: string;
  submit?: boolean;
};

let agent: AgentOverChromeBridge | null = null;
let visionActQueue: Promise<unknown> = Promise.resolve();

function midsceneEnabled(): boolean {
  return process.env.CHROME_ACP_MIDSCENE === "1" || process.env.CHROME_ACP_MIDSCENE === "true";
}

function requireMidsceneEnv(): void {
  if (!midsceneEnabled()) {
    throw new Error("Midscene is disabled. Start proxy with CHROME_ACP_MIDSCENE=1 and MIDSCENE_MODEL_* env vars.");
  }
  for (const name of ["MIDSCENE_MODEL_BASE_URL", "MIDSCENE_MODEL_API_KEY", "MIDSCENE_MODEL_NAME", "MIDSCENE_MODEL_FAMILY"]) {
    if (!process.env[name]) throw new Error(`Missing ${name} for Midscene vision automation.`);
  }
}

async function ensureBridgeAgent(): Promise<AgentOverChromeBridge> {
  requireMidsceneEnv();
  if (!agent) {
    agent = new AgentOverChromeBridge({
      closeConflictServer: true,
      serverListeningTimeout: 20_000,
    });
  }
  try {
    await agent.connectCurrentTab({ forceSameTabNavigation: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Midscene Bridge could not connect to the current Chrome tab: ${message}. ` +
      "Open the Midscene Chrome extension, enable Bridge Mode, allow current-tab control, then retry.",
    );
  }
  return agent;
}

function shouldReconnectAfterError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /No tab with given id|target.*closed|detached|not attached|Cannot find context|invalid tab/i.test(message);
}

async function resetBridgeAgent(): Promise<void> {
  const old = agent as any;
  agent = null;
  if (old && typeof old.destroy === "function") await old.destroy().catch(() => undefined);
  if (old && typeof old.close === "function") await old.close().catch(() => undefined);
}

async function callAgent(instance: AgentOverChromeBridge, args: VisionActArgs): Promise<unknown> {
  const intent = String(args.intent || args.target || "").trim();
  if (!intent) throw new Error("intent is required");
  const target = String(args.target || intent).trim();
  const mode = args.mode || "auto";
  const anyAgent = instance as any;

  if ((mode === "type" || args.text !== undefined) && args.text !== undefined) {
    if (typeof anyAgent.aiInput === "function") {
      const result = await anyAgent.aiInput(args.text, target);
      if (args.submit && typeof anyAgent.aiKeyboardPress === "function") {
        await anyAgent.aiKeyboardPress("Enter", target).catch(() => undefined);
      }
      return result;
    }
    return anyAgent.ai(`Input "${args.text}" into ${target}${args.submit ? " and press Enter" : ""}`);
  }

  if (mode === "tap" || mode === "click") {
    if (typeof anyAgent.aiTap === "function") return anyAgent.aiTap(target);
    return anyAgent.ai(`Click ${target}`);
  }

  if (mode === "assert") {
    if (typeof anyAgent.aiAssert === "function") return anyAgent.aiAssert(intent);
    return anyAgent.ai(`Assert: ${intent}`);
  }

  if (typeof anyAgent.ai === "function") return anyAgent.ai(intent);
  if (typeof anyAgent.aiAction === "function") return anyAgent.aiAction(intent);
  throw new Error("Midscene AgentOverChromeBridge does not expose ai/aiTap/aiInput methods.");
}

async function executeMidsceneVisionActNow(args: VisionActArgs): Promise<McpToolCallResult> {
  let instance = await ensureBridgeAgent();
  let result: unknown;
  try {
    result = await callAgent(instance, args);
  } catch (error) {
    if (!shouldReconnectAfterError(error)) throw error;
    await resetBridgeAgent();
    instance = await ensureBridgeAgent();
    result = await callAgent(instance, args);
  }
  return {
    content: [
      {
        type: "text",
        text: [
          "# Browser Vision Act",
          "",
          `- mode: ${args.mode || "auto"}`,
          `- intent: ${args.intent || ""}`,
          args.target ? `- target: ${args.target}` : undefined,
          "",
          "## Midscene Bridge Result",
          "",
          "```json",
          JSON.stringify(result ?? { ok: true }, null, 2),
          "```",
        ].filter(Boolean).join("\n"),
      },
    ],
  };
}

export async function executeMidsceneVisionAct(args: VisionActArgs): Promise<McpToolCallResult> {
  const run = visionActQueue.catch(() => undefined).then(() => executeMidsceneVisionActNow(args));
  visionActQueue = run;
  return run;
}
