import path from "node:path"
import { CodeToGraphRuntime } from "@/codetograph/runtime"

export function render(item: { name: string; content: string; location: string }) {
  const root = path.dirname(item.location)
  const deveco = CodeToGraphRuntime.selfCommand("generate")
    .map((argument) => `"${argument.replaceAll('"', '\\"')}"`)
    .join(" ")
  return [
    ...(item.name === "codetograph" || item.name === "document-project"
      ? [
          `The user explicitly invoked /${item.name}. Execute this workflow now against the current worktree.`,
          "Do not merely describe the workflow or ask for confirmation unless a required input is genuinely missing.",
          "",
        ]
      : []),
    item.content.replaceAll("{skill-root}", root).replaceAll("{deveco-command}", deveco).trim(),
    "",
    `Base directory for this skill: ${root}`,
    "Resolve all remaining relative skill paths from this directory.",
  ].join("\n")
}

export * as SkillCommandTemplate from "./skill-template"
