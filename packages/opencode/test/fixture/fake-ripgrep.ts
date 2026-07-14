import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

const args = process.argv.slice(2)

const files = await collectFiles(process.cwd())

if (args.includes("--json")) {
  const separator = args.indexOf("--")
  const pattern = args[separator + 1] ?? "sdk-parity"
  for (const file of files) {
    const text = await readFile(path.join(process.cwd(), file), "utf8")
    const offset = text.indexOf(pattern)
    if (offset < 0) continue
    const lineStart = text.lastIndexOf("\n", offset - 1) + 1
    const line = text.slice(0, offset).split("\n").length
    const lineText = text.slice(lineStart).split("\n", 1)[0] + "\n"
    console.log(JSON.stringify({
      type: "match",
      data: {
        path: { text: file },
        lines: { text: lineText },
        line_number: line,
        absolute_offset: offset,
        submatches: [{ match: { text: pattern }, start: offset - lineStart, end: offset - lineStart + pattern.length }],
      },
    }))
  }
}

if (args.includes("--files")) {
  const glob = args.find((arg) => arg.startsWith("--glob=") && !arg.includes("!"))?.slice("--glob=".length)
  const query = glob?.replaceAll("*", "")
  for (const file of files) if (!query || file.includes(query)) console.log(file)
}

async function collectFiles(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(path.join(root, prefix), { withFileTypes: true })
  const nested = await Promise.all(
    entries
      .filter((entry) => entry.name !== ".git")
      .map(async (entry) => {
        const relative = path.join(prefix, entry.name)
        if (entry.isDirectory()) return collectFiles(root, relative)
        return entry.isFile() ? [relative.replaceAll("\\", "/")] : []
      }),
  )
  return nested.flat().sort()
}
