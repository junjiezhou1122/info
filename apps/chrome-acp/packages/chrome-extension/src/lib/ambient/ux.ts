/**
 * @fileoverview Chrome ACP Ambient UX: Selection toolbar, writing suggestions,
 * and feedback utilities extracted from content.ts for testability.
 */

export interface SelectionAction {
  id: string;
  label: string;
  prompt: string;
}

export const DEFAULT_SELECTION_ACTIONS: SelectionAction[] = [
  {
    id: "explain",
    label: "Explain",
    prompt: "Explain this selected text in plain language. Keep it concise, and mention the page context if it matters.",
  },
  {
    id: "translate_zh",
    label: "Translate",
    prompt: "Translate this selected text into natural Simplified Chinese. Preserve names, technical terms, and the original meaning.",
  },
];

/**
 * Validate and normalize a selection action from user config storage.
 * Returns `null` when the action is disabled or missing required fields.
 */
export function selectionActionFromConfig(action: unknown): SelectionAction | null {
  if (!action || typeof action !== "object") return null;
  const a = action as Record<string, unknown>;
  if (a.enabled === false) return null;
  const id = String(a.id || "").trim();
  const label = String(a.label || "").trim();
  const prompt = String(a.prompt || "").trim();
  if (!id || !label || !prompt) return null;
  return { id, label, prompt };
}

export interface FeedbackPayload {
  feedbackType: string;
  value: unknown;
  reason: string;
  payload?: Record<string, unknown>;
}

/** Check whether a DOM element looks like a sensitive input that should not get writing suggestions. */
export function sensitiveEditable(element: Element): boolean {
  return /password|token|secret|api[_-]?key|credit card|验证码|密码/i.test(
    `${element.id || ""} ${element.getAttribute("name") || ""} ${element.getAttribute("autocomplete") || ""}`,
  );
}

/** Check whether the element or any ancestor has an autocomplete attribute indicating a secret. */
export function isSecretAutocomplete(element: Element): boolean {
  const attr = element.getAttribute("autocomplete");
  if (attr && /current-password|new-password|otp/i.test(attr)) return true;
  const parent = element.closest("[autocomplete]");
  if (parent) {
    const pAttr = parent.getAttribute("autocomplete");
    if (pAttr && /current-password|new-password|otp/i.test(pAttr)) return true;
  }
  return false;
}

/** Build a route-to-inbox feedback message. */
export function routeToInbox(
  viewId: string,
  viewType: string,
  action: "save" | "route" | "feedback",
): Record<string, unknown> {
  return {
    type: "feedback-view",
    viewId,
    viewType,
    feedbackType: action === "save" ? "analysis.useful" : "analysis.dismissed",
    value: action,
    applicationId: "chrome_acp.ambient",
    payload: { surface: "ambient", action },
  };
}

/** Normalize writing text for deduping. */
export function normalizeWriting(text: string): string {
  return String(text || "").replace(/\s+/g, " ").trim();
}

/** Check whether the writing text meets the minimum length for sending. */
export function shouldSendWritingText(
  text: string,
  element: unknown,
  lastWritingText: string,
): boolean {
  const normalized = normalizeWriting(text);
  if (normalized.length < 24 || normalized.length > 5000) return false;
  if (normalized === lastWritingText) return false;
  if (element instanceof HTMLInputElement && normalized.length < 40) return false;
  return true;
}
