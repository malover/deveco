import { resolveHomeGraphExecutable } from "./integration"

const projectRoot = process.cwd()
const executable = resolveHomeGraphExecutable()

function command(args: string[]) {
  if (process.platform === "win32" && executable.endsWith(".cmd")) {
    return ["cmd.exe", "/d", "/s", "/c", executable, ...args]
  }
  return [executable, ...args]
}

async function serve() {
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
