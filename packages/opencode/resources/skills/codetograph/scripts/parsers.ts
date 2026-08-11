import { Language, Parser } from "web-tree-sitter"
import { existsSync, mkdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { fileURLToPath } from "node:url"

const CACHE = join(homedir(), ".codetograph-cache")

export interface ParserConfig {
  lang: string
  wasm: string | null
  fallback: string | null
  npmPackage?: string
}

const WASM_RELEASES = {
  typescript: "https://github.com/tree-sitter/tree-sitter-typescript/releases/download/v0.23.2/tree-sitter-typescript.wasm",
  tsx: "https://github.com/tree-sitter/tree-sitter-typescript/releases/download/v0.23.2/tree-sitter-tsx.wasm",
  javascript: "https://github.com/tree-sitter/tree-sitter-javascript/releases/download/v0.23.1/tree-sitter-javascript.wasm",
  python: "https://github.com/tree-sitter/tree-sitter-python/releases/download/v0.23.6/tree-sitter-python.wasm",
  rust: "https://github.com/tree-sitter/tree-sitter-rust/releases/download/v0.24.0/tree-sitter-rust.wasm",
  go: "https://github.com/tree-sitter/tree-sitter-go/releases/download/v0.25.0/tree-sitter-go.wasm",
  java: "https://github.com/tree-sitter/tree-sitter-java/releases/download/v0.23.5/tree-sitter-java.wasm",
  cpp: "https://github.com/tree-sitter/tree-sitter-cpp/releases/download/v0.23.4/tree-sitter-cpp.wasm",
  c: "https://github.com/tree-sitter/tree-sitter-c/releases/download/v0.24.1/tree-sitter-c.wasm",
  csharp: "https://github.com/tree-sitter/tree-sitter-c-sharp/releases/download/v0.23.1/tree-sitter-c_sharp.wasm",
  ruby: "https://github.com/tree-sitter/tree-sitter-ruby/releases/download/v0.23.1/tree-sitter-ruby.wasm",
  php: "https://github.com/tree-sitter/tree-sitter-php/releases/download/v0.24.2/tree-sitter-php.wasm",
  scala: "https://github.com/tree-sitter/tree-sitter-scala/releases/download/v0.24.0/tree-sitter-scala.wasm",
  kotlin: "https://github.com/fwcd/tree-sitter-kotlin/releases/download/0.3.9/tree-sitter-kotlin.wasm",
  swift: "https://github.com/alex-pinkus/tree-sitter-swift/releases/download/0.7.1/tree-sitter-swift.wasm",
  bash: "https://github.com/tree-sitter/tree-sitter-bash/releases/download/v0.25.0/tree-sitter-bash.wasm",
  json: "https://github.com/tree-sitter/tree-sitter-json/releases/download/v0.24.8/tree-sitter-json.wasm",
  yaml: "https://github.com/tree-sitter-grammars/tree-sitter-yaml/releases/download/v0.7.2/tree-sitter-yaml.wasm",
}

export const EXT_MAP: Record<string, ParserConfig> = {
  ".ets": { lang: "arkts", wasm: null, fallback: ".ts", npmPackage: "tree-sitter-arkts" },
  ".ts": { lang: "typescript", wasm: WASM_RELEASES.typescript, fallback: null },
  ".tsx": { lang: "tsx", wasm: WASM_RELEASES.tsx, fallback: ".ts" },
  ".js": { lang: "javascript", wasm: WASM_RELEASES.javascript, fallback: null },
  ".jsx": { lang: "javascript", wasm: WASM_RELEASES.javascript, fallback: null },
  ".mjs": { lang: "javascript", wasm: WASM_RELEASES.javascript, fallback: null },
  ".cjs": { lang: "javascript", wasm: WASM_RELEASES.javascript, fallback: null },
  ".py": { lang: "python", wasm: WASM_RELEASES.python, fallback: null },
  ".go": { lang: "go", wasm: WASM_RELEASES.go, fallback: null },
  ".rs": { lang: "rust", wasm: WASM_RELEASES.rust, fallback: null },
  ".java": { lang: "java", wasm: WASM_RELEASES.java, fallback: null },
  ".kt": { lang: "kotlin", wasm: WASM_RELEASES.kotlin, fallback: null },
  ".kts": { lang: "kotlin", wasm: WASM_RELEASES.kotlin, fallback: null },
  ".cpp": { lang: "cpp", wasm: WASM_RELEASES.cpp, fallback: null },
  ".cc": { lang: "cpp", wasm: WASM_RELEASES.cpp, fallback: null },
  ".cxx": { lang: "cpp", wasm: WASM_RELEASES.cpp, fallback: null },
  ".hpp": { lang: "cpp", wasm: WASM_RELEASES.cpp, fallback: null },
  ".hh": { lang: "cpp", wasm: WASM_RELEASES.cpp, fallback: null },
  ".hxx": { lang: "cpp", wasm: WASM_RELEASES.cpp, fallback: null },
  ".c": { lang: "c", wasm: WASM_RELEASES.c, fallback: null },
  ".h": { lang: "c", wasm: WASM_RELEASES.c, fallback: null },
  ".cs": { lang: "csharp", wasm: WASM_RELEASES.csharp, fallback: null },
  ".rb": { lang: "ruby", wasm: WASM_RELEASES.ruby, fallback: null },
  ".php": { lang: "php", wasm: WASM_RELEASES.php, fallback: null },
  ".scala": { lang: "scala", wasm: WASM_RELEASES.scala, fallback: null },
  ".swift": { lang: "swift", wasm: WASM_RELEASES.swift, fallback: null },
  ".sh": { lang: "bash", wasm: WASM_RELEASES.bash, fallback: null },
  ".bash": { lang: "bash", wasm: WASM_RELEASES.bash, fallback: null },
  ".json": { lang: "json", wasm: WASM_RELEASES.json, fallback: null },
  ".yaml": { lang: "yaml", wasm: WASM_RELEASES.yaml, fallback: null },
  ".yml": { lang: "yaml", wasm: WASM_RELEASES.yaml, fallback: null },
  ".md": { lang: "markdown", wasm: null, fallback: null },
  ".txt": { lang: "text", wasm: null, fallback: null },
}

let initDone = false

async function initParser() {
  if (initDone) return
  const wasmPath = findWasm("tree-sitter.wasm")
  await Parser.init({
    locateFile() {
      return wasmPath
    },
  })
  initDone = true
}

function findWasm(name: string): string {
  const installed = (() => {
    try {
      return fileURLToPath(import.meta.resolve(`web-tree-sitter/${name}`))
    } catch {
      return undefined
    }
  })()
  const paths = [
    installed,
    join(CACHE, name),
    join(process.cwd(), "node_modules", "web-tree-sitter", name),
    join(import.meta.dirname || ".", "node_modules", "web-tree-sitter", name),
  ].filter((item): item is string => Boolean(item))
  for (const p of paths) {
    if (existsSync(p)) return p
  }
  return paths[0]
}

async function downloadWasm(url: string, dest: string): Promise<string> {
  mkdirSync(CACHE, { recursive: true })
  const destPath = join(CACHE, dest)
  if (existsSync(destPath) && statSync(destPath).size > 0) return destPath
  console.log(`  📥 Downloading: ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await Bun.write(destPath, buf)
  console.log(`  ✅ Cached: ${destPath}`)
  return destPath
}

const langCache = new Map<string, Language>()
const fallbackSet = new Set<string>()

export async function loadParser(ext: string): Promise<{ parser: Parser; lang: string; fallback: boolean }> {
  await initParser()
  const config = EXT_MAP[ext]
  if (!config) throw new Error(`No parser config for extension: ${ext}`)

  const langKey = config.lang

  if (langCache.has(langKey)) {
    const p = new Parser()
    p.setLanguage(langCache.get(langKey)!)
    return { parser: p, lang: langKey, fallback: fallbackSet.has(langKey) }
  }

  let wasmIsLocal = false

  if (!config.wasm && config.npmPackage) {
    const wasmFile = await tryNpmWasm(config.npmPackage, langKey)
    if (wasmFile) {
      config.wasm = wasmFile
      wasmIsLocal = true
    }
  }

  if (!config.wasm && config.fallback) {
    console.log(`  ⚠️  No WASM for .${ext}, falling back to ${config.fallback}`)
    fallbackSet.add(langKey)
    return loadParser(config.fallback)
  }

  if (!config.wasm) {
    throw new Error(`No parser available for .${ext} (no WASM URL, no fallback)`)
  }

  const wasmPath = wasmIsLocal ? config.wasm : await downloadWasm(config.wasm, `${config.npmPackage ? langKey + "_npm" : langKey}.wasm`)
  const lang = await Language.load(wasmPath)
  langCache.set(langKey, lang)

  const p = new Parser()
  p.setLanguage(lang)
  return { parser: p, lang: langKey, fallback: false }
}

async function tryNpmWasm(npmPackage: string, langKey: string): Promise<string | null> {
  const searchPaths = [
    join(process.cwd(), "node_modules", npmPackage),
    join(CACHE, "node_modules", npmPackage),
  ]

  for (const base of searchPaths) {
    if (!existsSync(base)) continue
    const candidates = [
      join(base, `tree-sitter-${langKey}.wasm`),
      join(base, `${npmPackage}.wasm`),
      join(base, "tree-sitter-arkts.wasm"),
    ]
    for (const cand of candidates) {
      if (existsSync(cand) && statSync(cand).size > 0) {
        console.log(`  ✅ Found local WASM: ${cand}`)
        return cand
      }
    }
  }

  console.log(`  ⚠️  npm package ${npmPackage} not found, trying npm install...`)
  const installDir = join(CACHE, "npm")
  mkdirSync(installDir, { recursive: true })

  try {
    const proc = Bun.spawnSync(
      ["bun", "add", npmPackage],
      { cwd: installDir, stdout: "inherit", stderr: "inherit" }
    )
    if (proc.exitCode !== 0) {
      console.log(`  ⚠️  Failed to install ${npmPackage}`)
      return null
    }

    const nodeModules = join(installDir, "node_modules", npmPackage)
    const wasmCandidates = [
      join(nodeModules, `tree-sitter-${langKey}.wasm`),
      join(nodeModules, `${npmPackage}.wasm`),
      join(nodeModules, "tree-sitter-arkts.wasm"),
    ]
    for (const cand of wasmCandidates) {
      if (existsSync(cand) && statSync(cand).size > 0) return cand
    }

    const pkgJsonPath = join(nodeModules, "package.json")
    if (existsSync(pkgJsonPath)) {
      const pkgJson = await Bun.file(pkgJsonPath).json()
      const main = pkgJson.main || pkgJson.module || ""
      const treeSitterDir = join(nodeModules, "tree-sitter")
      const wasmFiles = globWasm(nodeModules)
      if (wasmFiles.length > 0) {
        console.log(`  ✅ Found WASM via glob: ${wasmFiles[0]}`)
        return wasmFiles[0]
      }
    }
  } catch (e) {
    console.log(`  ⚠️  Error installing ${npmPackage}: ${e}`)
  }

  return null
}

function globWasm(dir: string): string[] {
  const results: string[] = []
  try {
    const entries = [...require("node:fs").readdirSync(dir, { recursive: true, withFileTypes: true })]
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith(".wasm")) {
        results.push(join(e.parentPath || dir, e.name))
      }
    }
  } catch {
    // dir may not exist
  }
  return results
}

export function getExtensionReport(): string[] {
  const lines: string[] = []
  for (const [ext, config] of Object.entries(EXT_MAP)) {
    const status = config.wasm ? "✅ built-in" : config.npmPackage ? "📦 npm" : config.fallback ? `→ ${config.fallback}` : "⚠️ skip"
    lines.push(`  ${ext}  → ${config.lang}  [${status}]`)
  }
  return lines
}

export function resolveConfig(
  ext: string,
  dynamicConfig: Record<string, ParserConfig>
): ParserConfig | null {
  const existing = EXT_MAP[ext]
  if (existing) return existing
  const dyn = dynamicConfig[ext]
  if (dyn) {
    EXT_MAP[ext] = dyn
    return dyn
  }
  return null
}
