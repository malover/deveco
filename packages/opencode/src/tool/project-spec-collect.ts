import path from "node:path"
import { Effect, Schema, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { InstanceState } from "@/effect/instance-state"
import { resolveCodeGraphExecutable } from "@/codegraph/integration"
import * as Tool from "./tool"
import DESCRIPTION from "./project-spec-collect.txt"
import { compactProjectSpecEvidence, extractProjectSpecPaths } from "./project-spec-evidence"

const MAX_EVIDENCE_CHARACTERS = 15_000
const MAX_DIRECT_READS = 12
const MAX_FOLLOW_UP_GAPS = 2
const GRAPH_QUERIES = [
  "Locate real application or process entry points and module composition. Start from package.json, module.json5, build-profile.json5, src/index, main, MainAbility, EntryView, and Stage where present; trace dependencies outward and identify subsystem boundaries with concrete repository-relative paths.",
  "Trace verified startup and runtime lifecycle flows from actual entry symbols such as main, onCreate, MainAbility, EntryView, Stage, server start, or CLI run. Include initialization order, ownership, state movement, side effects, and concrete paths.",
  "Trace settings, configuration, state models, persistence or database access, and shared managers from producers through consumers. Include concrete symbols, callers, storage boundaries, and repository-relative paths.",
  "Identify central shared contracts and high fan-in or fan-out symbols. Report representative callers and callees, cross-module propagation paths, test coverage, and repository-relative paths rather than generic type references.",
  "Identify evidence-backed modification risks and reusable change paths from configuration or input through models, services, views, persistence, and tests. Include concrete symbols and repository-relative paths.",
] as const

const METADATA_PATTERN =
  "{README*,AGENTS.md,CLAUDE.md,package.json,module.json5,build-profile.json5,oh-package.json5,hvigorfile.*,CMakeLists.txt,*/README*,*/AGENTS.md,*/CLAUDE.md,*/package.json,*/module.json5,*/build-profile.json5,*/oh-package.json5,*/hvigorfile.*,*/CMakeLists.txt,*/*/README*,*/*/AGENTS.md,*/*/CLAUDE.md,*/*/package.json,*/*/module.json5,*/*/build-profile.json5,*/*/oh-package.json5,*/*/hvigorfile.*,*/*/CMakeLists.txt,.github/workflows/*}"
const Parameters = Schema.Struct({
  gaps: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "One or two precisely named evidence gaps for the single allowed follow-up pass",
  }),
})

type EvidenceItem = { focus?: string; path?: string; evidence: string }
type Backend = {
  name: "codegraph" | "targeted"
  indexAction: "reused" | "initialized" | "synced" | "rebuilt" | "unavailable"
  queries: number
  limitations: string[]
}

function executableCommand(executable: string, args: string[]) {
  if (process.platform === "win32" && executable.endsWith(".cmd")) {
    return { command: "cmd.exe", args: ["/d", "/s", "/c", executable, ...args] }
  }
  return { command: executable, args }
}

function safeRelative(root: string, candidate: string) {
  const relative = path.relative(root, path.resolve(root, candidate)).replaceAll("\\", "/")
  if (!relative || relative.startsWith("../") || path.isAbsolute(relative)) return undefined
  return relative
}

function fitBundle(bundle: {
  schema: string
  mode: string
  backend: Backend
  graphEvidence: EvidenceItem[]
  repositoryEvidence: EvidenceItem[]
  sourceEvidence: EvidenceItem[]
  metrics: Record<string, unknown>
}) {
  let text = JSON.stringify(bundle)
  if (text.length <= MAX_EVIDENCE_CHARACTERS) return text

  bundle.graphEvidence = bundle.graphEvidence.map((item) => ({
    ...item,
    evidence: compactProjectSpecEvidence(item.evidence, 900),
  }))
  bundle.repositoryEvidence = bundle.repositoryEvidence.map((item) => ({
    ...item,
    evidence: compactProjectSpecEvidence(item.evidence, 140),
  }))
  bundle.sourceEvidence = bundle.sourceEvidence.map((item) => ({
    ...item,
    evidence: compactProjectSpecEvidence(item.evidence, 220),
  }))
  text = JSON.stringify(bundle)
  if (text.length <= MAX_EVIDENCE_CHARACTERS) return text

  bundle.graphEvidence = bundle.graphEvidence.map((item) => ({
    ...item,
    evidence: compactProjectSpecEvidence(item.evidence, 650),
  }))
  bundle.repositoryEvidence = bundle.repositoryEvidence.slice(0, 4)
  bundle.sourceEvidence = bundle.sourceEvidence.slice(0, 4)
  text = JSON.stringify(bundle)
  while (text.length > MAX_EVIDENCE_CHARACTERS && bundle.sourceEvidence.length) {
    bundle.sourceEvidence.pop()
    text = JSON.stringify(bundle)
  }
  while (text.length > MAX_EVIDENCE_CHARACTERS && bundle.repositoryEvidence.length) {
    bundle.repositoryEvidence.pop()
    text = JSON.stringify(bundle)
  }
  while (text.length > MAX_EVIDENCE_CHARACTERS && bundle.graphEvidence.length) {
    bundle.graphEvidence.pop()
    text = JSON.stringify(bundle)
  }
  return text
}

export const ProjectSpecCollectTool = Tool.define(
  "project_spec_collect",
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const sessionCalls = new Map<string, number>()

    const run = (root: string, executable: string, args: string[], abort: AbortSignal) => {
      const command = executableCommand(executable, args)
      return Effect.scoped(
        Effect.gen(function* () {
          const handle = yield* spawner.spawn(
            ChildProcess.make(command.command, command.args, {
              cwd: root,
              extendEnv: true,
              stdin: "ignore",
              stdout: "pipe",
              stderr: "pipe",
            }),
          )
          const [stdout, stderr, exitCode] = yield* Effect.all(
            [
              Stream.mkString(Stream.decodeText(handle.stdout)),
              Stream.mkString(Stream.decodeText(handle.stderr)),
              handle.exitCode,
            ],
            { concurrency: 3 },
          )
          if (abort.aborted) return yield* Effect.fail(new Error("Project SPEC evidence collection was cancelled"))
          if (exitCode !== 0) {
            return yield* Effect.fail(new Error(stderr.trim() || stdout.trim() || `CodeGraph exited with ${exitCode}`))
          }
          return stdout
        }),
      )
    }

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const startedAt = Date.now()
          const instance = yield* InstanceState.context
          const root = instance.directory
          const gaps = (params.gaps ?? [])
            .map((gap) => gap.trim())
            .filter(Boolean)
            .slice(0, MAX_FOLLOW_UP_GAPS)
          const previousCalls = sessionCalls.get(ctx.sessionID) ?? 0
          if (previousCalls >= 2) {
            return yield* Effect.fail(new Error("Project SPEC evidence collection is limited to two calls per session"))
          }
          if (previousCalls === 1 && gaps.length === 0) {
            return yield* Effect.fail(
              new Error("The second Project SPEC collection call requires one or two named gaps"),
            )
          }
          const queries = gaps.length ? gaps : [...GRAPH_QUERIES]
          const limitations: string[] = []
          let indexAction: Backend["indexAction"] = "unavailable"
          let executable: string | undefined
          let graphStartedAt = Date.now()

          yield* Effect.try({
            try: () => {
              executable = resolveCodeGraphExecutable()
            },
            catch: (error) => error,
          }).pipe(
            Effect.catch((error) =>
              Effect.sync(() =>
                limitations.push(`CodeGraph unavailable: ${error instanceof Error ? error.message : String(error)}`),
              ),
            ),
          )

          if (executable) {
            const indexDir = path.join(root, ".codegraph")
            const hasIndex = yield* fs.existsSafe(indexDir)
            const bootstrap = hasIndex
              ? run(root, executable, ["status", "--json", root], ctx.abort).pipe(
                  Effect.flatMap(() => run(root, executable!, ["sync", "--quiet", root], ctx.abort)),
                  Effect.as("synced" as const),
                  Effect.catch(() =>
                    run(root, executable!, ["index", "--quiet", root], ctx.abort).pipe(Effect.as("rebuilt" as const)),
                  ),
                )
              : run(root, executable, ["init", root], ctx.abort).pipe(Effect.as("initialized" as const))
            indexAction = yield* bootstrap.pipe(
              Effect.catch((error) =>
                Effect.sync(() => {
                  limitations.push(
                    `CodeGraph bootstrap failed: ${error instanceof Error ? error.message : String(error)}`,
                  )
                  return "unavailable" as const
                }),
              ),
            )
          }

          const graphEvidence: EvidenceItem[] = []
          if (executable && indexAction !== "unavailable") {
            const results = yield* Effect.forEach(
              queries,
              (query) =>
                run(root, executable!, ["explore", "--path", root, "--max-files", "8", query], ctx.abort).pipe(
                  Effect.map((output) => ({ focus: query, evidence: compactProjectSpecEvidence(output, 1_400) })),
                  Effect.catch((error) => {
                    limitations.push(`Graph query failed: ${error instanceof Error ? error.message : String(error)}`)
                    return Effect.succeed(undefined)
                  }),
                ),
              { concurrency: 3 },
            )
            graphEvidence.push(...results.filter((item): item is NonNullable<typeof item> => item !== undefined))
          }
          const graphMs = Date.now() - graphStartedAt

          const candidates = yield* fs
            .glob(METADATA_PATTERN, { cwd: root, absolute: true, dot: true, include: "file" })
            .pipe(Effect.orElseSucceed(() => [] as string[]))
          const metadataPaths = candidates
            .map((candidate) => safeRelative(root, candidate))
            .filter((candidate): candidate is string => candidate !== undefined)
            .filter(
              (candidate) =>
                !candidate
                  .split("/")
                  .some((part) => ["node_modules", ".git", ".codegraph", "build", "dist"].includes(part)),
            )
            .toSorted((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b))
            .slice(0, 6)

          const repositoryEvidence = yield* Effect.forEach(
            metadataPaths,
            (relative) =>
              fs.readFileStringSafe(path.join(root, relative)).pipe(
                Effect.map((content) => ({ path: relative, evidence: compactProjectSpecEvidence(content ?? "", 220) })),
                Effect.catch(() => Effect.succeed({ path: relative, evidence: "" })),
              ),
            { concurrency: 6 },
          )

          const rawGraph = graphEvidence.map((item) => item.evidence).join("\n")
          const sourcePaths = extractProjectSpecPaths(rawGraph)
            .map((candidate) => safeRelative(root, candidate))
            .filter((candidate): candidate is string => candidate !== undefined)
            .filter((candidate) => !metadataPaths.includes(candidate))
            .slice(0, MAX_DIRECT_READS - metadataPaths.length)
          const sourceEvidence = yield* Effect.forEach(
            sourcePaths,
            (relative) =>
              fs.readFileStringSafe(path.join(root, relative)).pipe(
                Effect.map((content) => ({ path: relative, evidence: compactProjectSpecEvidence(content ?? "", 350) })),
                Effect.catch(() => Effect.succeed({ path: relative, evidence: "" })),
              ),
            { concurrency: 6 },
          )

          const bundle = {
            schema: "project-spec-evidence-v1",
            mode: gaps.length ? "follow-up" : "initial",
            backend: {
              name: graphEvidence.length ? ("codegraph" as const) : ("targeted" as const),
              indexAction,
              queries: graphEvidence.length,
              limitations,
            },
            graphEvidence,
            repositoryEvidence: repositoryEvidence.filter((item) => item.evidence),
            sourceEvidence: sourceEvidence.filter((item) => item.evidence),
            metrics: {
              queryBudget: gaps.length ? MAX_FOLLOW_UP_GAPS : GRAPH_QUERIES.length,
              collectorCall: previousCalls + 1,
              directReads: metadataPaths.length + sourcePaths.length,
              directReadBudget: MAX_DIRECT_READS,
              globGreps: 1,
              rounds: 1,
              graphMs,
              totalMs: Date.now() - startedAt,
              evidenceCharacters: 0,
            },
          }
          let output = fitBundle(bundle)
          bundle.metrics.evidenceCharacters = output.length
          output = fitBundle(bundle)
          sessionCalls.set(ctx.sessionID, previousCalls + 1)

          return {
            title: gaps.length ? "Project SPEC follow-up evidence" : "Project SPEC evidence",
            output,
            metadata: {
              truncated: false,
              backend: bundle.backend.name,
              indexAction,
              queries: bundle.backend.queries,
              directReads: bundle.metrics.directReads,
              evidenceCharacters: output.length,
              totalMs: bundle.metrics.totalMs,
            },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
