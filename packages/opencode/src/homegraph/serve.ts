import fs from "node:fs"
import path from "node:path"
import { resolveHomeGraphExecutable } from "./integration"

const projectRoot = process.cwd()
const executable = resolveHomeGraphExecutable()

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
    throw new Error(
      `HomeGraph ${args.join(" ")} failed: ${stderr.trim() || stdout.trim() || `exit code ${exitCode}`}`,
    )
  }
}

async function bootstrap() {
  const indexDir = path.join(projectRoot, ".homegraph")
  if (fs.existsSync(indexDir)) return

  await run(["init", "-i", projectRoot])
  if (!fs.existsSync(indexDir)) throw new Error(`HomeGraph bootstrap completed without creating ${indexDir}`)
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
  process.exit(await processHandle.exited)
}

serve().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
