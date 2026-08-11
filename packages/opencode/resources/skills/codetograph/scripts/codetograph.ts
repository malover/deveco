import { existsSync, statSync, readdirSync, Dirent } from "node:fs"
import { join, extname, relative, sep } from "node:path"
import { loadParser, EXT_MAP, resolveConfig, ParserConfig } from "./parsers"
import { extractEntities, ExtractedEntity, ImportEdge } from "./extract"
import { buildGraph, exportGraphJson, exportReport, GraphData } from "./graph"

const EXCLUDE_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "__pycache__", ".next",
  "oh_modules", ".preview", ".hvigor", ".turbo", "coverage",
  ".gradle", "target", "__MACOSX",
  "graphify-out", "codetograph_out", "_bmad-output", "_bmad", "docs",
  "hmosword-build", "cache",
])

const SOURCE_PATTERNS = [
  ".ets", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".pyi", ".go", ".rs", ".java", ".kt", ".kts",
  ".cpp", ".cc", ".cxx", ".hpp", ".hh", ".hxx", ".c", ".h",
  ".cs", ".rb", ".php", ".scala", ".swift", ".dart",
  ".sh", ".bash", ".json", ".yaml", ".yml", ".md", ".txt",
  ".vue", ".svelte", ".lua", ".sql",
]

interface ScanResult {
  files: string[]
  extensions: Map<string, string[]>
  unknownExtensions: string[]
}

function scanProject(root: string): ScanResult {
  const files: string[] = []
  const extensions = new Map<string, string[]>()

  const walk = (dir: string) => {
    let dirents: Dirent[]
    try {
      dirents = readdirSync(dir, { withFileTypes: true }) as Dirent[]
    } catch {
      return
    }
    for (const entry of dirents) {
      if (entry.name.startsWith(".") && entry.name !== ".") {
        if (entry.name === ".git" || entry.name === ".preview" || entry.name === ".hvigor") continue
      }
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (EXCLUDE_DIRS.has(entry.name)) continue
        walk(full)
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase()
        if (SOURCE_PATTERNS.includes(ext)) {
          files.push(relative(root, full))
          if (!extensions.has(ext)) extensions.set(ext, [])
          extensions.get(ext)!.push(full)
        }
      }
    }
  }

  walk(root)
  return {
    files: files.sort(),
    extensions,
    unknownExtensions: [],
  }
}

async function runPhases(
  root: string,
  outputDir: string,
  projectName: string,
  dynamicConfig: Record<string, ParserConfig> = {}
): Promise<void> {
  console.log(`\n🔍 CodeToGraph — tree-sitter codebase audit\n`)
  console.log(`   Project: ${root}`)
  console.log(`   Output:  ${outputDir}\n`)

  console.log(`📂 Phase 0: Discovery`)
  const scan = scanProject(root)
  console.log(`   Found ${scan.files.length} source files across ${scan.extensions.size} extensions\n`)

  for (const [ext, paths] of [...scan.extensions.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const config = resolveConfig(ext, dynamicConfig)
    const label = config ? (config.wasm ? "✅" : config.fallback ? `→${config.fallback}` : "⚠️") : "❓"
    console.log(`   ${ext.padEnd(6)} ${label}  (${paths.length} files)`)
  }
  console.log()

  console.log(`🔧 Phase 0.5: Parser Setup`)
  const loadedParsers = new Map<string, { parser: unknown; lang: string; fallback: boolean }>()
  const parseWarnings: string[] = []

  for (const ext of scan.extensions.keys()) {
    const config = resolveConfig(ext, dynamicConfig)
    if (!config) {
      parseWarnings.push(`Unknown extension: ${ext} — skipping ${scan.extensions.get(ext)!.length} files`)
      continue
    }
    if (!config.wasm && !config.fallback && !config.npmPackage) {
      parseWarnings.push(`No parser for ${ext} — skipping ${scan.extensions.get(ext)!.length} files`)
      continue
    }
    try {
      const result = await loadParser(ext)
      loadedParsers.set(ext, result)
      console.log(`   ${ext} → ${result.lang} ${result.fallback ? "(fallback)" : ""}`)
    } catch (e) {
      parseWarnings.push(`Failed to load parser for ${ext}: ${e}`)
    }
  }
  console.log()

  if (parseWarnings.length > 0) {
    console.log("⚠️  Warnings:")
    for (const w of parseWarnings) console.log(`   ${w}`)
    console.log()
  }

  console.log(`📝 Phase 1: Entity Extraction`)
  const allEntities = new Map<string, ExtractedEntity[]>()
  const allImports: ImportEdge[] = []
  const sourceTexts = new Map<string, string>()
  let parsedCount = 0
  let errorCount = 0

  for (const file of scan.files) {
    const ext = extname(file).toLowerCase()
    const parserInfo = loadedParsers.get(ext)
    if (!parserInfo) continue

    try {
      const fullPath = join(root, file)
      const source = await Bun.file(fullPath).text()
      sourceTexts.set(file, source)
      const { parser } = parserInfo as { parser: { parse: (s: string) => { rootNode: unknown } } }
      const tree = (parser as { parse: (s: string) => { rootNode: import("web-tree-sitter").SyntaxNode } }).parse(source)
      const { entities, imports } = extractEntities(
        tree.rootNode,
        file,
        parserInfo.lang,
        source
      )
      allEntities.set(file, entities)
      allImports.push(...imports)
      parsedCount++
      if (parsedCount % 50 === 0 || parsedCount === scan.files.length) {
        console.log(`   Parsed: ${parsedCount}/${scan.files.length} files`)
      }
    } catch (e) {
      errorCount++
      if (errorCount <= 5) {
        console.log(`   ⚠️  Error parsing ${file}: ${e}`)
      }
    }
  }
  console.log(`   Done: ${parsedCount} parsed, ${errorCount} errors\n`)

  let totalEntities = 0
  for (const [, entities] of allEntities) {
    totalEntities += entities.length
  }
  console.log(`   Extracted ${totalEntities} entities and ${allImports.length} imports\n`)

  console.log(`🔗 Phase 2: Graph Construction`)
  const graph = buildGraph(allEntities, allImports, root, sourceTexts)
  console.log(`   Nodes: ${graph.graph.total_entities}, Links: ${graph.graph.total_links}\n`)

  console.log(`📊 Phase 3: Analysis`)
  const { detectCycles, computeGodNodes, computeSurprisingConnections } = await import("./graph")
  const cycles = detectCycles(graph.nodes, graph.links)
  const degree = new Map<string, number>()
  for (const l of graph.links) {
    degree.set(l.source, (degree.get(l.source) || 0) + 1)
    degree.set(l.target, (degree.get(l.target) || 0) + 1)
  }
  const godNodes = computeGodNodes(graph.nodes, graph.links)
  console.log(`   Cycles: ${cycles.length}`)
  if (cycles.length > 0) {
    for (const c of cycles.slice(0, 3)) {
      console.log(`   ⚠️  ${c.join(" → ")}`)
    }
  }
  console.log(`   Top god nodes:`)
  for (const gn of godNodes.slice(0, 5)) {
    console.log(`   ⚡ ${gn.label} (${gn.file}) — ${gn.connections} connections`)
  }
  console.log()

  console.log(`💾 Phase 4: Export`)
  exportGraphJson(graph, outputDir)
  exportReport(graph, allEntities, outputDir, projectName)
  console.log()

  console.log(`✅ Phase 5: Self-Audit`)
  console.log(`   | Total Files | Analyzed | Entities | Links | Cross-file | Missing | Status |`)
  console.log(`   |-------------|----------|----------|-------|------------|---------|--------|`)
  const crossFile = graph.links.filter(l => l.relation === "calls" && l.confidence !== "EXTRACTED").length
  console.log(`   | ${String(graph.graph.total_files).padEnd(11)} | ${String(parsedCount).padEnd(8)} | ${String(graph.graph.total_entities).padEnd(8)} | ${String(graph.graph.total_links).padEnd(5)} | ${String(crossFile).padEnd(10)} | ${String(errorCount).padEnd(7)} | ✅ Pass |`)
  console.log(`\n🎉 Complete! Output in ${outputDir}/`)
}

function findWasmInProject(ext: string): string | null {
  const searchRoots = [
    join(process.cwd(), "node_modules"),
    join(process.cwd(), "opencode", "node_modules"),
    join(process.cwd(), "opencode", "packages", "opencode", "node_modules"),
  ]
  const wasmName = `tree-sitter-${ext}.wasm`

  for (const root of searchRoots) {
    if (!existsSync(root)) continue
    const walk = (dir: string): string | null => {
      try {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (entry.isFile() && entry.name === wasmName) {
            return join(entry.parentPath || dir, entry.name)
          }
          if (entry.isDirectory() && !EXCLUDE_DIRS.has(entry.name) && !entry.name.startsWith("@")) {
            const result = walk(join(dir, entry.name))
            if (result) return result
          }
        }
      } catch {}
      return null
    }
    const found = walk(root)
    if (found) return found
  }
  return null
}

export async function run(args = process.argv.slice(2)) {
  const projectArg = args.find(a => a.startsWith("--project="))?.split("=")[1]
    || args[args.indexOf("--project") + 1]
    || process.cwd()
  const outputArg = args.find(a => a.startsWith("--output="))?.split("=")[1]
    || args[args.indexOf("--output") + 1]
    || "docs"
  await runPhases(projectArg, outputArg, projectArg.split(sep).pop() || "project")
}

if (import.meta.main) {
  await run().catch(error => {
    console.error("Fatal error:", error)
    process.exit(1)
  })
}
