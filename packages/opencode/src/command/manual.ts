const names = new Set(["codetograph", "document-project", "document-project2"])

export function matches(name: string) {
  return names.has(name)
}

export function source(name: string) {
  return matches(name) ? ("command" as const) : ("skill" as const)
}

export * as ManualSkillCommand from "./manual"
