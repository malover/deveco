import path from "node:path"
import { Effect } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { InstanceState } from "@/effect/instance-state"
import * as Tool from "./tool"
import DESCRIPTION from "./project-spec-write.txt"
import { ProjectSpecParameters, renderProjectSpec, type ProjectSpecInput } from "./project-spec-document"

export function projectSpecTarget(directory: string) {
  return path.join(directory, "docs", "project-spec.md")
}

export const ProjectSpecWriteTool = Tool.define(
  "project_spec_write",
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service

    return {
      description: DESCRIPTION,
      parameters: ProjectSpecParameters,
      execute: (params: ProjectSpecInput, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const instance = yield* InstanceState.context
          const target = projectSpecTarget(instance.directory)
          const temporary = path.join(
            instance.directory,
            "docs",
            `.project-spec.${ctx.sessionID}.${ctx.callID ?? "write"}.tmp`.replace(/[^a-zA-Z0-9._-]/g, "_"),
          )
          const existed = yield* fs.existsSafe(target)
          const content = renderProjectSpec(params)

          yield* ctx.ask({
            permission: "project_spec_write",
            patterns: [target],
            always: [target],
            metadata: {},
          })
          yield* fs.ensureDir(path.dirname(target))
          yield* fs.writeFileString(temporary, content)
          yield* fs
            .rename(temporary, target)
            .pipe(Effect.ensuring(fs.remove(temporary).pipe(Effect.catch(() => Effect.void))))

          return {
            title: "Project SPEC written",
            output: JSON.stringify({
              path: target,
              status: existed ? "updated" : "created",
              hash: new Bun.CryptoHasher("sha256").update(content).digest("hex"),
              validation: "passed",
              bytes: Buffer.byteLength(content),
            }),
            metadata: {
              truncated: false,
              path: target,
              status: existed ? "updated" : "created",
              homeGraphCalls: params.graphAnalysis.calls,
              directReads: params.graphAnalysis.directReads,
            },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
