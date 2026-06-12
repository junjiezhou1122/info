import type { ProcessorContext, ProcessorHandlerResult, ProcessorInput } from "../types.js";

export async function runAgentTaskProcessor(
  _input: ProcessorInput,
  context: ProcessorContext,
): Promise<ProcessorHandlerResult> {
  throw new Error(`Agent task processor runtime is not implemented yet: ${context.processor.id}`);
}
