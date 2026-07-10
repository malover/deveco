import fs from "node:fs/promises"
import path from "node:path"
import { cases } from "./registry"
import { collectEnvironment, ensureBundledSkillScriptsAvailable, makeContext, resetReportDir, latestReportDir } from "./env"
import { writeReports, writeJUnitXml } from "./report"
import type { ExecutedCase, LiveTestCase, SuiteReport } from "./types"

function parseArgs(argv: string[]) {
  const result: {
    caseIDs: string[]
    category?: string
    priority?: string
    list?: boolean
    cooldownMs?: number
    retries?: number
    format?: string
    parallel?: number
  } = { caseIDs: [] }
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === "--case") result.caseIDs.push(argv[++index])
    else if (arg === "--category") result.category = argv[++index]
    else if (arg === "--priority") result.priority = argv[++index]
    else if (arg === "--list") result.list = true
    else if (arg === "--cooldown") result.cooldownMs = parseInt(argv[++index], 10)
    else if (arg === "--retries") result.retries = parseInt(argv[++index], 10)
    else if (arg === "--format") result.format = argv[++index]
    else if (arg === "--parallel") result.parallel = parseInt(argv[++index], 10)
  }
  return result
}

function duration(start: number) {
  return Date.now() - start
}

function skipReason(testCase: LiveTestCase, env: Awaited<ReturnType<typeof collectEnvironment>>) {
  if (testCase.requires.includes("real-llm") && !env.liveEnabled) {
    return "DEVECO_LIVE_LLM=1 is required for real LLM cases"
  }
  if (testCase.requires.includes("huawei-auth") && !env.auth.hasDevecoOAuth) {
    return "DevEco Huawei OAuth credential was not found. Run `bun run --conditions=browser src/index.ts auth login --provider deveco`."
  }
  if (testCase.requires.includes("deveco-provider") && !env.auth.hasDevecoOAuth) {
    return "DevEco provider cannot be injected without a DevEco OAuth credential"
  }
  if (testCase.requires.includes("deveco-home") && !env.deveco.home) {
    return "DevEco Studio was not found. Set DEVECO_HOME to a valid DevEco Studio installation."
  }
  if (testCase.requires.includes("harmony-emulator") && env.deveco.emulators.length === 0) {
    return "A running HarmonyOS emulator is required. `hdc list targets` returned no 127.0.0.1:<port> emulator targets."
  }
  if (
    testCase.requires.includes("harmony-emulator-installed") &&
    env.deveco.installedEmulators.length === 0
  ) {
    return "No installed HarmonyOS emulator was found in DevEco Studio's deployed emulator list. Install one via DevEco Studio's Device Manager."
  }
  if (testCase.requires.includes("third-party-model") && !env.thirdPartyModel.available) {
    return "No third-party model is configured in test/live-e2e/fixtures/live-e2e.config.json. Populate thirdPartyModel.provider with one provider/model before running this case."
  }
  return undefined
}

async function runCaseOnce(
  testCase: LiveTestCase,
  env: Awaited<ReturnType<typeof collectEnvironment>>,
): Promise<ExecutedCase> {
  const start = Date.now()
  const reason = skipReason(testCase, env)
  if (reason) {
    return {
      case: testCase,
      status: "skipped",
      durationMs: duration(start),
      skipReason: reason,
      artifacts: {},
    }
  }

  const ctx = makeContext()
  const artifacts: Record<string, string> = {}
  const originalWriteArtifact = ctx.writeArtifact
  ctx.writeArtifact = async (caseID, filename, content) => {
    const file = await originalWriteArtifact(caseID, filename, content)
    artifacts[filename] = file
    return file
  }

  // Inject the test case's stallMs as the default for runDeveco calls.
  // Individual runDeveco calls can still override stallMs explicitly.
  if (testCase.stallMs) {
    const originalRunDeveco = ctx.runDeveco
    ctx.runDeveco = async (args, options) => originalRunDeveco(args, { stallMs: testCase.stallMs, ...options })
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      testCase.run(ctx),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`Timed out after ${testCase.timeoutMs}ms`)), testCase.timeoutMs)
      }),
    ])
    return {
      case: testCase,
      status: "passed",
      durationMs: duration(start),
      result,
      artifacts,
    }
  } catch (error) {
    return {
      case: testCase,
      status: "failed",
      durationMs: duration(start),
      error: error instanceof Error ? error.stack || error.message : String(error),
      artifacts,
    }
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

async function runCase(
  testCase: LiveTestCase,
  env: Awaited<ReturnType<typeof collectEnvironment>>,
  maxRetries: number,
  baseRetryDelayMs: number,
): Promise<ExecutedCase> {
  let lastResult: ExecutedCase | undefined
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    lastResult = await runCaseOnce(testCase, env)
    if (lastResult.status === "passed" || lastResult.status === "skipped") return lastResult
    if (attempt < maxRetries) {
      // Detect likely rate-limited failures: no text/tool output was emitted.
      // This covers both fast empty responses (<10s) and stall-killed processes
      // (60-120s of silence). Both indicate the LLM returned nothing due to
      // concurrent request limits or rate-window exhaustion. Use a longer backoff
      // to let the rate window reset.
      const isLikelyRateLimited = /No text.*event was emitted/.test(lastResult.error ?? "")
        || (lastResult.result?.stdout === "" && lastResult.result?.stderr === "")
      const delay = isLikelyRateLimited ? 30_000 : baseRetryDelayMs * Math.pow(2, attempt)
      const tag = isLikelyRateLimited ? " (rate limit backoff)" : ""
      console.log(`  Failed, retry ${attempt + 1}/${maxRetries} in ${delay}ms${tag}...`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  return lastResult!
}

function printList(selected: LiveTestCase[]) {
  console.log("Live E2E cases")
  for (const testCase of selected) {
    console.log(`${testCase.id.padEnd(20)} ${testCase.category.padEnd(8)} ${testCase.priority.padEnd(3)} ${testCase.title}`)
  }
}

function printSummary(report: SuiteReport) {
  console.log("")
  console.log("Live E2E Summary")
  console.log("")
  console.log(`Total:   ${report.summary.total}`)
  console.log(`Passed:  ${report.summary.passed}`)
  console.log(`Failed:  ${report.summary.failed}`)
  console.log(`Skipped: ${report.summary.skipped}`)
  console.log(`Duration: ${(report.summary.durationMs / 1000).toFixed(1)}s`)
  console.log("")
  for (const item of report.cases) {
    const status = item.status.toUpperCase().padEnd(7)
    const time = `${(item.durationMs / 1000).toFixed(1)}s`.padStart(7)
    console.log(`[${status}] ${item.case.id.padEnd(20)} ${time}  ${item.case.title}`)
    if (item.status === "failed" && item.error) console.log(`          ${item.error.split("\n")[0]}`)
    if (item.status === "skipped" && item.skipReason) console.log(`          ${item.skipReason}`)
  }
  console.log("")
  console.log(`Report: ${latestReportDir}/index.html`)
}

async function writeIncrementalReport(
  results: ExecutedCase[],
  environment: Record<string, unknown>,
  suiteStart: number,
  startedAt: string,
  writeJunit: boolean,
) {
  const partial: SuiteReport = {
    summary: {
      total: results.length,
      passed: results.filter((item) => item.status === "passed").length,
      failed: results.filter((item) => item.status === "failed").length,
      skipped: results.filter((item) => item.status === "skipped").length,
      durationMs: duration(suiteStart),
      startedAt,
      finishedAt: new Date().toISOString(),
    },
    cases: results,
    environment,
  }
  await fs.writeFile(path.join(latestReportDir, "summary.json"), JSON.stringify(partial, null, 2))
  if (writeJunit) await writeJUnitXml(partial, latestReportDir)
}

function adaptiveCooldownMs(baseMs: number, lastResult: ExecutedCase): number {
  const lastDuration = lastResult.durationMs
  const wasSlow = lastDuration > lastResult.case.timeoutMs * 0.8
  let adaptive = baseMs
  if (lastDuration > 60_000) adaptive += Math.min(Math.floor(lastDuration / 20_000) * 1000, 12_000)
  if (wasSlow && lastResult.case.requires.includes("real-llm")) adaptive += 10_000
  return adaptive
}

async function main() {
  const args = parseArgs(Bun.argv.slice(2))
  const cooldownMs = args.cooldownMs ?? 3000
  const maxRetries = args.retries ?? 2
  const maxConcurrent = args.parallel ?? 3
  let selected = cases
  if (args.caseIDs.length > 0) selected = selected.filter((testCase) => args.caseIDs.includes(testCase.id))
  if (args.category) selected = selected.filter((testCase) => testCase.category === args.category)
  if (args.priority) selected = selected.filter((testCase) => testCase.priority === args.priority)

  if (selected.length === 0) {
    console.error("No live e2e cases matched the provided filters")
    process.exit(1)
  }
  if (args.list) {
    printList(selected)
    return
  }

  await resetReportDir()
  const syncedSkills = await ensureBundledSkillScriptsAvailable()
  const suiteStart = Date.now()
  const startedAt = new Date().toISOString()
  const environment = await collectEnvironment()

  console.log("Environment:")
  console.log(`  LLM enabled: ${environment.liveEnabled}`)
  console.log(`  Model:       ${environment.selectedModel}`)
  console.log(`  DevEco home: ${environment.deveco.home ?? "(not found)"}`)
  console.log(`  Emulators:   ${environment.deveco.emulators.length}`)
  console.log(`  Auth:        ${environment.auth.hasDevecoOAuth ? "OK" : "MISSING"}`)
  if (syncedSkills) console.log("  Synced deveco-create-project skill scripts to config directory")
  if (!environment.liveEnabled) console.log("  WARNING: DEVECO_LIVE_LLM=1 not set — real-llm cases will be skipped")
  if (!environment.auth.hasDevecoOAuth) console.log("  WARNING: DevEco OAuth not found — huawei-auth cases will be skipped")
  console.log("")

  const results: ExecutedCase[] = []
  const writeJunit = args.format === "junit"

  const sequentialCases = selected.filter((c) => c.parallel !== true)
  const parallelCases = selected.filter((c) => c.parallel === true)

  for (let i = 0; i < sequentialCases.length; i++) {
    const testCase = sequentialCases[i]
    console.log(`Running ${testCase.id}: ${testCase.title}`)
    const result = await runCase(testCase, environment, maxRetries, cooldownMs * 3)
    results.push(result)
    await writeIncrementalReport(results, environment, suiteStart, startedAt, writeJunit)
    if (i < sequentialCases.length - 1 && testCase.requires.includes("real-llm") && result.status !== "skipped") {
      const cooldown = adaptiveCooldownMs(cooldownMs, result)
      if (cooldown > 0) {
        console.log(`  Cooldown ${cooldown}ms...`)
        await new Promise((resolve) => setTimeout(resolve, cooldown))
      }
    }
  }

  if (parallelCases.length > 0) {
    console.log(`\nRunning ${parallelCases.length} cases in parallel (max ${maxConcurrent} concurrent)...`)
    let nextIndex = 0
    const workers = Array.from(
      { length: Math.min(maxConcurrent, parallelCases.length) },
      async (_, workerIndex) => {
        // Stagger worker starts to avoid hitting the LLM simultaneously.
        // Worker 0 starts immediately, worker N starts at N*3s.
        if (workerIndex > 0) await new Promise((r) => setTimeout(r, 3000 * workerIndex))
        while (nextIndex < parallelCases.length) {
          const testCase = parallelCases[nextIndex++]
          console.log(`Running ${testCase.id}: ${testCase.title}`)
          const result = await runCase(testCase, environment, maxRetries, cooldownMs * 3)
          results.push(result)
          await writeIncrementalReport(results, environment, suiteStart, startedAt, writeJunit)
          // Inter-case cooldown to prevent rate-limit cascades across workers.
          // Without this, a worker finishing a fast case immediately hits the
          // LLM alongside other workers, triggering rate-limit retries that
          // cost 15s backoff + 120s stallMs each — far more than 5s.
          if (nextIndex < parallelCases.length) {
            await new Promise((r) => setTimeout(r, 5000))
          }
        }
      },
    )
    await Promise.all(workers)
  }

  const finishedAt = new Date().toISOString()
  const report: SuiteReport = {
    summary: {
      total: results.length,
      passed: results.filter((item) => item.status === "passed").length,
      failed: results.filter((item) => item.status === "failed").length,
      skipped: results.filter((item) => item.status === "skipped").length,
      durationMs: duration(suiteStart),
      startedAt,
      finishedAt,
    },
    cases: results,
    environment,
  }

  await writeReports(report, latestReportDir)
  if (args.format === "junit") await writeJUnitXml(report, latestReportDir)
  printSummary(report)

  if (report.summary.failed > 0) process.exit(1)
  process.exit(0)
}

await main()
