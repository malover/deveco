import path from "node:path"

export function projectSpecTarget(directory: string) {
  return path.join(directory, "docs", "project-spec.md")
}
