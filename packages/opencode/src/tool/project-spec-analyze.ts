import path from "node:path"
import fs from "node:fs/promises"
import { Effect, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import { analyzeProjectSpecWorkspace } from "./project-spec-workspace"
import * as Tool from "./tool"
import DESCRIPTION from "./project-spec-analyze.txt"

const Parameters = Schema.Struct({
  root: Schema.optional(Schema.String).annotate({
    description: "Workspace-relative root to analyze. Defaults to the opened workspace.",
  }),
  revision: Schema.optional(Schema.String).annotate({
    description: "Baseline label recorded in the inventory. Defaults to HEAD for Git workspaces.",
  }),
  includeStats: Schema.optional(Schema.Boolean).annotate({
    description: "Count owned source files and lines. Defaults to true.",
  }),
  resolveDependencies: Schema.optional(Schema.Boolean).annotate({
    description: "Resolve local manifest/package dependency candidates. Defaults to true.",
  }),
  outputPath: Schema.optional(Schema.String).annotate({
    description: "Workspace-relative JSON artifact path. Defaults to docs/.projectspec/workspace-inventory.json.",
  }),
})

function within(root: string, candidate: string) {
  const relative = path.relative(root, candidate)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

function normalize(relative: string) {
  return relative.replaceAll("\\", "/").replace(/^\.\//, "") || "."
}

export const ProjectSpecAnalyzeTool = Tool.define(
  "project_spec_analyze",
  Effect.succeed({
    description: DESCRIPTION,
    parameters: Parameters,
    execute: (params: Schema.Schema.Type<typeof Parameters>) =>
      Effect.gen(function* () {
        const instance = yield* InstanceState.context
        const root = path.resolve(instance.directory, params.root ?? ".")
        if (!within(instance.directory, root)) {
          return yield* Effect.fail(new Error("Project SPEC analysis root must stay inside the opened workspace"))
        }
        const outputPath = path.resolve(instance.directory, params.outputPath ?? "docs/.projectspec/workspace-inventory.json")
        if (!within(instance.directory, outputPath)) {
          return yield* Effect.fail(new Error("Project SPEC inventory output must stay inside the opened workspace"))
        }
        const inventory = yield* Effect.promise(() =>
          analyzeProjectSpecWorkspace({
            root,
            revision: params.revision?.trim() || "HEAD",
            includeStats: params.includeStats !== false,
            resolveDependencies: params.resolveDependencies !== false,
          }),
        )
        yield* Effect.promise(async () => {
          await fs.mkdir(path.dirname(outputPath), { recursive: true })
          const temporary = `${outputPath}.tmp`
          await Bun.write(temporary, `${JSON.stringify(inventory, null, 2)}\n`)
          await fs.rename(temporary, outputPath)
        })
        const relativeOutput = normalize(path.relative(instance.directory, outputPath))
        return {
          title: "ProjectSpec workspace inventory",
          output: JSON.stringify({
            artifact: relativeOutput,
            selectedRevision: inventory.selectedRevision,
            workspaceMode: inventory.workspaceMode,
            scale: inventory.scale,
            projects: inventory.projects.map((project) => ({
              id: project.id,
              path: project.path,
              kind: project.kind,
              modules: project.modules.length,
            })),
            stats: inventory.stats,
            dependencyEdges: inventory.dependencies.length,
            next: "Freeze this inventory, discover capabilities, then write documentation-plan.json. Do not reread every descriptor.",
          }),
          metadata: {
            truncated: false,
            artifact: relativeOutput,
            projects: inventory.projects.length,
            modules: inventory.stats.moduleCount,
            sourceFiles: inventory.stats.sourceFiles,
            lines: inventory.stats.lines,
            elapsedMs: inventory.stats.elapsedMs,
          },
        }
      }).pipe(Effect.orDie),
  }),
)
