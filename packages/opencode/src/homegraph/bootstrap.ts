import fs from "node:fs"
import path from "node:path"
import { ensureHomeGraphIndex } from "./lifecycle"
import { resolveHomeGraphExecutable } from "./integration"

export function bootstrapCommand(root: string) {
  if (path.basename(process.execPath).toLowerCase().startsWith("bun")) {
    return [process.execPath, path.join(import.meta.dir, "bootstrap.ts"), root]
  }
  return [process.execPath, "--internal-homegraph-bootstrap", root]
}

export async function bootstrap(root = process.cwd()) {
  const executable = resolveHomeGraphExecutable()
  const command = (args: string[]) => {
    if (process.platform === "win32" && executable.endsWith(".cmd")) {
      return ["cmd.exe", "/d", "/s", "/c", executable, ...args]
    }
    return [executable, ...args]
  }
  const execute = async (args: string[]) => {
    const processHandle = Bun.spawn(command(args), {
      cwd: root,
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
    return { exitCode, stdout, stderr }
  }
  return ensureHomeGraphIndex({
    root,
    hasIndex: fs.existsSync(path.join(root, ".homegraph")),
    check: async (args) => (await execute(args)).exitCode === 0,
    require: async (args) => {
      const result = await execute(args)
      if (result.exitCode === 0) return
      throw new Error(
        `HomeGraph ${args.join(" ")} failed: ${result.stderr.trim() || result.stdout.trim() || `exit code ${result.exitCode}`}`,
      )
    },
  })
}

if (import.meta.main) {
  const action = await bootstrap(process.argv[2])
  process.stdout.write(`HomeGraph ${action}.\n`)
}

export * as HomeGraphBootstrap from "./bootstrap"
