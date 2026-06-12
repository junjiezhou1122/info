import type { ProcessorContext, ProcessorHandlerResult, ProcessorInput } from "../types.js";

export async function runCliProcessor(
  _input: ProcessorInput,
  context: ProcessorContext,
): Promise<ProcessorHandlerResult> {
  throw new Error(`CLI processor runtime is not implemented yet: ${context.processor.id}`);
}
