import path from "node:path"

export type Runtime = "typescript" | "python"

export function enabled() {
  return process.env.DEVECO_CODETOGRAPH_ENABLED !== "0"
}

export function selected(): Runtime {
  return process.env.DEVECO_CODETOGRAPH_RUNTIME?.trim().toLowerCase() === "python" ? "python" : "typescript"
}

export function selfCommand(mode: "mcp" | "generate") {
  const development = path.basename(process.execPath).toLowerCase().startsWith("bun")
  const entrypoint = development && process.argv[1] ? path.resolve(process.argv[1]) : undefined
  return [process.execPath, ...(entrypoint ? [entrypoint] : []), `--internal-codetograph-${mode}`]
}

export function pythonCommand() {
  const configured = process.env.DEVECO_CODETOGRAPH_PYTHON?.trim()
  if (configured) return [configured]
  const python3 = Bun.which("python3")
  if (python3) return [python3]
  const python = Bun.which("python")
  if (python) return [python]
  const launcher = process.platform === "win32" ? Bun.which("py") : undefined
  if (launcher) return [launcher, "-3"]
}

export * as CodeToGraphRuntime from "./runtime"
