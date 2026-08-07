import fs from "node:fs"
import path from "node:path"
import { resolveCodeGraphExecutable } from "./integration"

const projectRoot = process.cwd()
const executable = resolveCodeGraphExecutable()

function command(args: string[]) {
  if (process.platform === "win32" && executable.endsWith(".cmd")) {
    return ["cmd.exe", "/d", "/s", "/c", executable, ...args]
  }

  return [executable, ...args]
}

async function run(args: string[]) {
  const processHandle = Bun.spawn(command(args), {
    cwd: projectRoot,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  })

  const [exitCode, stdout, stderr] = await Promise.all([
    processHandle.exited,
    new Response(processHandle.stdout).text(),
    new Response(processHandle.stderr).text(),
  ])

  if (exitCode !== 0) {
    const detail = stderr.trim() || stdout.trim() || `exit code ${exitCode}`
    throw new Error(`CodeGraph ${args.join(" ")} failed: ${detail}`)
  }
}

async function bootstrap() {
  const codegraphDir = path.join(projectRoot, ".codegraph")
  if (fs.existsSync(codegraphDir)) return

  await run(["init"])
  await run(["index"])

  if (!fs.existsSync(codegraphDir)) {
    throw new Error(`CodeGraph bootstrap completed without creating ${codegraphDir}`)
  }
}

async function serve() {
  await bootstrap()

  const processHandle = Bun.spawn(command(["serve", "--mcp"]), {
    cwd: projectRoot,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  })

  const exitCode = await processHandle.exited
  process.exit(exitCode)
}

serve().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
