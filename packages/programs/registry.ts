import { ProgramRuntime } from "./runner.js";
import type { ProgramRuntimeConfig } from "./runner.js";
import type { ContextStore } from "@info/core";
import { languageLearningProgram } from "./builtins/language-learning.js";
import { browserAmbientExploreCapability, browserAmbientProgram } from "./builtins/browser-ambient.js";
import { projectAmbientProgram } from "./builtins/project-ambient.js";
import { routingLearningProgram } from "./builtins/routing-learning.js";
import { feedbackLearningProgram } from "./builtins/feedback-learning.js";
import { dailySummaryProgram } from "./builtins/daily-summary.js";
import { researchShadowProgram } from "./builtins/research-shadow.js";
import { proactiveResearchProgram, toolsmithAmbientProgram, writingAmbientProgram } from "./builtins/proactive-ambient.js";
import { agentTaskSubmitCapability } from "./capabilities/agent-task-submit.js";
import type { Capability, Program } from "./types.js";

export function defaultProgramDefinitions(): Program[] {
  return [
    languageLearningProgram,
    browserAmbientProgram,
    researchShadowProgram,
    projectAmbientProgram,
    routingLearningProgram,
    feedbackLearningProgram,
    dailySummaryProgram,
    proactiveResearchProgram,
    writingAmbientProgram,
    toolsmithAmbientProgram,
  ];
}

export function defaultCapabilityDefinitions(): Capability[] {
  return [
    agentTaskSubmitCapability,
    browserAmbientExploreCapability,
  ];
}

export function createDefaultProgramRuntime(store?: ContextStore, config: ProgramRuntimeConfig = {}): ProgramRuntime {
  const runtime = new ProgramRuntime(store, config);
  for (const capability of defaultCapabilityDefinitions()) runtime.registerCapability(capability);
  for (const program of defaultProgramDefinitions()) runtime.registerProgram(program);
  return runtime;
}

export function listDefaultPrograms() {
  return createDefaultProgramRuntime().listPrograms().map(program => ({
    id: program.id,
    title: program.title,
    purpose: program.purpose,
    version: program.version,
    default_speed: program.default_speed,
    default_autonomy: program.default_autonomy,
    produces: program.produces,
    capabilities: program.capabilities,
    applications: program.applications,
    learns_from: program.learns_from,
  }));
}

export function listDefaultCapabilities() {
  return createDefaultProgramRuntime().listCapabilities().map(capability => ({
    id: capability.id,
    title: capability.title,
    purpose: capability.purpose,
    version: capability.version,
    mode: capability.mode,
    default_speed: capability.default_speed,
    default_autonomy: capability.default_autonomy,
    produces: capability.produces,
  }));
}
