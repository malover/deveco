export function projectSpecMode(env: Record<string, string | undefined> = process.env) {
  if (env.DEVECO_PROJECT_SPEC_ISOLATED === "1" || env.DEVECO_PROJECT_SPEC_V2 === "0") return "legacy-isolated" as const
  return "v2-direct" as const
}

export function projectSpecGoalPrompt(prompt: string, env: Record<string, string | undefined> = process.env) {
  return prompt.replaceAll("{PROJECT_SPEC_MODE}", projectSpecMode(env))
}
