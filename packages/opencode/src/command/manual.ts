const names = new Set(["codetograph", "document-project"])

export function matches(name: string) {
  return names.has(name)
}

export * as ManualSkillCommand from "./manual"
