import path from "node:path"

export function serverCommand() {
  if (development()) return [process.execPath, path.join(import.meta.dir, "entry.ts")]
  return [process.execPath, "--internal-codetograph-mcp"]
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

function development() {
  return path.basename(process.execPath).toLowerCase().startsWith("bun")
}

export * as CodeToGraphRuntime from "./runtime"
