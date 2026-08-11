import path from "node:path"

export type Runtime = "typescript" | "python"

export function serverCommand(runtime: Runtime) {
  if (development()) return [process.execPath, path.join(import.meta.dir, "entry.ts"), runtime]
  return [process.execPath, "--internal-codetograph-mcp", runtime]
}

export function generateCommand() {
  if (development()) {
    return [
      process.execPath,
      path.resolve(import.meta.dir, "../../resources/skills/codetograph/scripts/codetograph.ts"),
    ]
  }
  return [process.execPath, "--internal-codetograph-generate"]
}

export function pythonCommand() {
  const configured = process.env.DEVECO_CODETOGRAPH_PYTHON?.trim()
  if (configured) return [configured]
  const python3 = Bun.which("python3")
  if (python3) return [python3]
  const python = Bun.which("python")
  if (python) return [python]
  if (process.platform === "win32") return [Bun.which("py") ?? "py", "-3"]
  return ["python3"]
}

function development() {
  return path.basename(process.execPath).toLowerCase().startsWith("bun")
}

export * as CodeToGraphRuntime from "./runtime"
