import type { ProcessorContext, ProcessorHandlerResult, ProcessorInput } from "../types.js";

export async function runHttpProcessor(
  _input: ProcessorInput,
  context: ProcessorContext,
): Promise<ProcessorHandlerResult> {
  throw new Error(`HTTP processor runtime is not implemented yet: ${context.processor.id}`);
}
