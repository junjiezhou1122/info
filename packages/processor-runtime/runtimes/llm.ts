import type { ProcessorContext, ProcessorHandlerResult, ProcessorInput } from "../types.js";

export async function runLlmProcessor(
  _input: ProcessorInput,
  context: ProcessorContext,
): Promise<ProcessorHandlerResult> {
  throw new Error(`LLM processor runtime is not implemented yet: ${context.processor.id}`);
}
