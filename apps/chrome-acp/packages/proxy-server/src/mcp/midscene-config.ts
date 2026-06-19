const MIDSCENE_MODEL_ENV = {
  MIDSCENE_MODEL_BASE_URL: ["VISION_LLM_BASE_URL", "OPENAI_BASE_URL", "LLM_BASE_URL"],
  MIDSCENE_MODEL_API_KEY: ["VISION_LLM_API_KEY", "OPENAI_API_KEY", "LLM_API_KEY"],
  MIDSCENE_MODEL_NAME: ["VISION_LLM_MODEL", "OPENAI_MODEL", "LLM_MODEL"],
  MIDSCENE_MODEL_FAMILY: [],
} as const;

function readEnv(name: keyof typeof MIDSCENE_MODEL_ENV): string | undefined {
  if (process.env[name]) return process.env[name];
  for (const fallback of MIDSCENE_MODEL_ENV[name]) {
    if (process.env[fallback]) return process.env[fallback];
  }
  if (name === "MIDSCENE_MODEL_FAMILY") return inferModelFamily(readEnv("MIDSCENE_MODEL_NAME"));
  return undefined;
}

function inferModelFamily(model: string | undefined): string | undefined {
  const normalized = model?.toLowerCase();
  if (!normalized) return undefined;
  if (normalized.includes("qwen")) return "qwen";
  if (normalized.includes("glm") || normalized.includes("z-ai")) return "glm";
  if (normalized.includes("gpt")) return "gpt";
  if (normalized.includes("claude")) return "claude";
  return undefined;
}

export function applyMidsceneEnvDefaults(): void {
  const names = Object.keys(MIDSCENE_MODEL_ENV) as Array<keyof typeof MIDSCENE_MODEL_ENV>;
  for (const name of names) {
    const value = readEnv(name);
    if (value && !process.env[name]) process.env[name] = value;
  }
}

export function midsceneEnabled(): boolean {
  return process.env.CHROME_ACP_MIDSCENE === "1" || process.env.CHROME_ACP_MIDSCENE === "true";
}

export function midsceneExposed(): boolean {
  return process.env.CHROME_ACP_EXPOSE_MIDSCENE === "1" || process.env.CHROME_ACP_EXPOSE_MIDSCENE === "true";
}

export function missingMidsceneEnv(): string[] {
  const names = Object.keys(MIDSCENE_MODEL_ENV) as Array<keyof typeof MIDSCENE_MODEL_ENV>;
  return names.filter(name => !readEnv(name));
}

export function isMidsceneToolExposed(): boolean {
  return midsceneExposed() && midsceneEnabled() && missingMidsceneEnv().length === 0;
}

export function midsceneUnavailableMessage(): string {
  if (!midsceneExposed()) {
    return "Midscene vision tools are hidden by default. Restart the proxy with CHROME_ACP_EXPOSE_MIDSCENE=1 only when visual automation is explicitly needed.";
  }
  if (!midsceneEnabled()) {
    return "Midscene vision tools are exposed but disabled. Restart the proxy with CHROME_ACP_MIDSCENE=1, or unset CHROME_ACP_EXPOSE_MIDSCENE to hide them.";
  }
  const missing = missingMidsceneEnv();
  if (missing.length) {
    return `Midscene vision tools are exposed but not configured. Missing ${missing.join(", ")}.`;
  }
  return "Midscene vision automation is unavailable.";
}
