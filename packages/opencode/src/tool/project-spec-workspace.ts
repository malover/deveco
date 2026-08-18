import path from "node:path"
import fs from "node:fs/promises"
import { parse, type ParseError } from "jsonc-parser"

const DEFAULT_EXCLUDES = [
  ".git",
  ".homegraph",
  ".hvigor",
  "node_modules",
  "oh_modules",
  "build",
  "out",
  "dist",
  "coverage",
  "vendor",
  "third_party",
  "third-party",
  "generated",
] as const

const SOURCE_EXTENSIONS = new Set([
  ".ets",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".c",
  ".cc",
  ".cpp",
  ".cxx",
  ".h",
  ".hh",
  ".hpp",
  ".java",
  ".kt",
  ".kts",
  ".py",
  ".rs",
  ".go",
  ".swift",
  ".dart",
  ".rb",
  ".php",
  ".cs",
])

const DESCRIPTORS = new Set([
  ".gitmodules",
  "manifest.xml",
  "build-profile.json5",
  "module.json5",
  "oh-package.json5",
  "oh-package-lock.json5",
  "bundle.json",
  "subsystem_config.json",
  "BUILD.gn",
  "package.json",
  "pnpm-workspace.yaml",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "settings.gradle",
  "settings.gradle.kts",
])

type ModuleRecord = {
  id: string
  name: string
  path: string
  kind: string
  descriptor: string
  targets: string[]
  sourceFiles: number
}

type ProjectRecord = {
  id: string
  outputSlug: string
  packageName?: string
  path: string
  kind: string
  descriptors: string[]
  modules: ModuleRecord[]
}

type DependencyRecord = {
  consumer: string
  provider: string
  contract: string
  evidence: string
}

type AnalyzeOptions = {
  root: string
  revision: string
  includeStats: boolean
  resolveDependencies: boolean
}

function normalize(relative: string) {
  const value = relative.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "")
  return value || "."
}

function isExcluded(relative: string) {
  return normalize(relative)
    .split("/")
    .some((part) => DEFAULT_EXCLUDES.includes(part as (typeof DEFAULT_EXCLUDES)[number]))
}

async function listWorkspaceFiles(root: string) {
  const processHandle = Bun.spawn(
    [
      "rg",
      "--files",
      "--hidden",
      "-0",
      ...DEFAULT_EXCLUDES.flatMap((directory) => ["-g", `!**/${directory}/**`]),
    ],
    { cwd: root, stdout: "pipe", stderr: "pipe" },
  )
  const [exitCode, stdout] = await Promise.all([processHandle.exited, new Response(processHandle.stdout).text()])
  if (exitCode === 0 || (exitCode === 1 && !stdout)) {
    return stdout
      .split("\0")
      .map(normalize)
      .filter((item) => item !== "." && !isExcluded(item))
      .toSorted()
  }

  const files: string[] = []
  const visit = async (directory: string) => {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    await Promise.all(
      entries.map(async (entry) => {
        const absolute = path.join(directory, entry.name)
        const relative = normalize(path.relative(root, absolute))
        if (isExcluded(relative)) return
        if (entry.isDirectory()) return visit(absolute)
        if (entry.isFile()) files.push(relative)
      }),
    )
  }
  await visit(root)
  return files.toSorted()
}

async function readStructured(root: string, relative: string) {
  const text = await Bun.file(path.join(root, relative)).text()
  const errors: ParseError[] = []
  const parsed = parse(text, errors, { allowTrailingComma: true, disallowComments: false })
  if (!errors.length) return parsed as Record<string, unknown>
  const normalized = text
    .replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$-]*)(\s*:)/g, '$1"$2"$3')
    .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, value: string) => JSON.stringify(value.replaceAll("\\'", "'")))
  return parse(normalized, [], { allowTrailingComma: true, disallowComments: false }) as Record<string, unknown>
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function safeName(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback
}

function projectKind(descriptors: string[]) {
  const arkts = descriptors.some((item) => item.endsWith("build-profile.json5"))
  const component = descriptors.some((item) => item.endsWith("bundle.json"))
  if (arkts && component) return "mixed"
  if (arkts) return "arkts"
  if (component) return "openharmony-component"
  if (descriptors.some((item) => item.endsWith("package.json"))) return "package"
  return "other"
}

function projectForPath(projects: ProjectRecord[], relative: string) {
  return projects
    .filter((project) => project.path === "." || relative === project.path || relative.startsWith(`${project.path}/`))
    .toSorted((left, right) => right.path.length - left.path.length)[0]
}

function localDependencyTarget(projectPath: string, value: string) {
  const raw = value.replace(/^(?:file|link):/, "")
  if (!raw.startsWith(".")) return undefined
  return normalize(path.posix.join(projectPath === "." ? "" : projectPath, raw))
}

async function lineStats(root: string, files: string[]) {
  const source = files.filter((file) => SOURCE_EXTENSIONS.has(path.extname(file).toLowerCase()))
  const byLanguage: Record<string, { files: number; lines: number }> = {}
  let lines = 0
  for (let offset = 0; offset < source.length; offset += 64) {
    const batch = source.slice(offset, offset + 64)
    const counts = await Promise.all(
      batch.map(async (relative) => {
        const content = await Bun.file(path.join(root, relative)).text()
        return content ? content.split(/\r?\n/).length : 0
      }),
    )
    batch.forEach((relative, index) => {
      const extension = path.extname(relative).toLowerCase().slice(1) || "unknown"
      byLanguage[extension] ??= { files: 0, lines: 0 }
      byLanguage[extension].files++
      byLanguage[extension].lines += counts[index] ?? 0
      lines += counts[index] ?? 0
    })
  }
  return { sourceFiles: source.length, lines, byLanguage }
}

export async function analyzeProjectSpecWorkspace(options: AnalyzeOptions) {
  const startedAt = Date.now()
  const files = await listWorkspaceFiles(options.root)
  const descriptorPaths = files.filter(
    (file) => DESCRIPTORS.has(path.posix.basename(file)) || file === ".repo/manifest.xml",
  )
  const descriptorsByRoot = new Map<string, string[]>()
  descriptorPaths.forEach((relative) => {
    const basename = path.posix.basename(relative)
    if (
      ![
        "build-profile.json5",
        "module.json5",
        "oh-package.json5",
        "oh-package-lock.json5",
        "bundle.json",
        "package.json",
        "Cargo.toml",
        "go.mod",
        "pom.xml",
      ].includes(basename)
    ) {
      return
    }
    const directory = normalize(path.posix.dirname(relative))
    const current = descriptorsByRoot.get(directory) ?? []
    current.push(relative)
    descriptorsByRoot.set(directory, current)
  })

  const linkedRoots = new Set<string>()
  const manifest = descriptorPaths.find((item) => item === ".repo/manifest.xml")
  if (manifest) {
    const text = await Bun.file(path.join(options.root, manifest)).text()
    for (const match of text.matchAll(/<project\b[^>]*\bpath=["']([^"']+)["']/g)) linkedRoots.add(normalize(match[1]))
  }
  const gitmodules = descriptorPaths.find((item) => item === ".gitmodules")
  if (gitmodules) {
    const text = await Bun.file(path.join(options.root, gitmodules)).text()
    for (const match of text.matchAll(/^\s*path\s*=\s*(.+?)\s*$/gm)) linkedRoots.add(normalize(match[1]))
  }
  const rootPackage = descriptorPaths.find((item) => item === "package.json")
  if (rootPackage) {
    const data = await readStructured(options.root, rootPackage)
    const workspacePatterns = Array.isArray(data.workspaces)
      ? strings(data.workspaces)
      : strings(object(data.workspaces)?.packages)
    workspacePatterns
      .filter((item) => !item.startsWith("!"))
      .forEach((item) => {
        if (!item.includes("*") && !item.includes("{")) {
          linkedRoots.add(normalize(item))
          return
        }
        const matcher = new Bun.Glob(`${item.replace(/\/$/, "")}/package.json`)
        files
          .filter((file) => matcher.match(file))
          .forEach((file) => linkedRoots.add(normalize(path.posix.dirname(file))))
      })
  }

  const declaredModuleRoots = new Set<string>()
  const buildProfiles = descriptorPaths.filter((item) => item.endsWith("build-profile.json5"))
  for (const descriptor of buildProfiles) {
    const data = await readStructured(options.root, descriptor)
    const projectPath = normalize(path.posix.dirname(descriptor))
    const modules = Array.isArray(data.modules) ? data.modules : []
    modules.forEach((value) => {
      const module = object(value)
      if (!module) return
      const sourcePath = safeName(module.srcPath, safeName(module.name, ""))
      if (!sourcePath) return
      declaredModuleRoots.add(normalize(path.posix.join(projectPath === "." ? "" : projectPath, sourcePath)))
    })
  }

  const candidateRoots = [...descriptorsByRoot.keys()].filter((candidate) => {
    if (candidate === ".") return true
    if (declaredModuleRoots.has(candidate)) return false
    const parts = candidate.split("/").map((item) => item.toLowerCase())
    const nonProduct = parts.some((item) => ["templates", "fixtures", "testdata", "samples"].includes(item))
    const skillResource = candidate.toLowerCase().includes("/resources/skills/")
    if ((nonProduct || skillResource) && !linkedRoots.has(candidate)) return false
    const descriptors = descriptorsByRoot.get(candidate) ?? []
    if (descriptors.some((item) => item.endsWith("build-profile.json5") || item.endsWith("bundle.json"))) return true
    return linkedRoots.has(candidate)
  })
  if (!candidateRoots.length) candidateRoots.push(".")

  const projects: ProjectRecord[] = []
  for (const projectPath of candidateRoots.toSorted((left, right) => left.localeCompare(right))) {
    const descriptors = descriptorsByRoot.get(projectPath) ?? []
    const preferred = descriptors.find((item) => item.endsWith("oh-package.json5")) ?? descriptors.find((item) => item.endsWith("package.json"))
    const metadata = preferred ? await readStructured(options.root, preferred) : {}
    const name = safeName(metadata.name, projectPath === "." ? "root" : path.posix.basename(projectPath))
    projects.push({
      id: projectPath === "." ? "_root" : projectPath,
      outputSlug: name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "root",
      ...(typeof metadata.name === "string" ? { packageName: metadata.name } : {}),
      path: projectPath,
      kind: projectKind(descriptors),
      descriptors: descriptors.toSorted(),
      modules: [],
    })
  }

  for (const descriptor of buildProfiles) {
    const project = projectForPath(projects, descriptor)
    if (!project) continue
    const data = await readStructured(options.root, descriptor)
    const modules = Array.isArray(data.modules) ? data.modules : []
    modules.forEach((value, index) => {
      const module = object(value)
      if (!module) return
      const name = safeName(module.name, `module-${index + 1}`)
      const sourcePath = safeName(module.srcPath, name)
      const modulePath = normalize(path.posix.join(project.path === "." ? "" : project.path, sourcePath))
      const targets = Array.isArray(module.targets)
        ? module.targets.map((item) => safeName(object(item)?.name, "")).filter(Boolean)
        : []
      project.modules.push({
        id: `${name}@${modulePath}`,
        name,
        path: modulePath,
        kind: "arkts-module",
        descriptor,
        targets,
        sourceFiles: 0,
      })
    })
  }

  const moduleDescriptors = descriptorPaths.filter((item) => item.endsWith("module.json5"))
  for (const descriptor of moduleDescriptors) {
    const project = projectForPath(projects, descriptor)
    if (!project) continue
    const modulePath = normalize(path.posix.dirname(descriptor))
    const declared = project.modules.find(
      (module) => module.path === modulePath || modulePath.startsWith(`${module.path}/`),
    )
    if (declared) {
      declared.descriptor = descriptor
      continue
    }
    const data = await readStructured(options.root, descriptor)
    const module = object(data.module) ?? data
    const name = safeName(module.name, path.posix.basename(modulePath))
    project.modules.push({
      id: `${name}@${modulePath}`,
      name,
      path: modulePath,
      kind: safeName(module.type, "arkts-module"),
      descriptor,
      targets: [],
      sourceFiles: 0,
    })
  }

  const gnDescriptors = descriptorPaths.filter((item) => item.endsWith("BUILD.gn"))
  for (const descriptor of gnDescriptors) {
    const project = projectForPath(projects, descriptor)
    if (!project || project.kind !== "openharmony-component") continue
    const content = await Bun.file(path.join(options.root, descriptor)).text()
    const targets = [...content.matchAll(/\b(?:ohos_[a-z_]+|group|executable|shared_library|static_library|source_set)\s*\(\s*["']([^"']+)["']/g)]
      .map((match) => match[1])
      .filter((name, index, all) => all.indexOf(name) === index)
    targets.forEach((name) => {
      const modulePath = normalize(path.posix.dirname(descriptor))
      project.modules.push({
        id: `${name}@${modulePath}`,
        name,
        path: modulePath,
        kind: "gn-target",
        descriptor,
        targets: [],
        sourceFiles: 0,
      })
    })
  }

  projects.forEach((project) => {
    project.modules = project.modules
      .filter((module, index, all) => all.findIndex((candidate) => candidate.id === module.id) === index)
      .map((module) => ({
        ...module,
        sourceFiles: files.filter(
          (file) => file === module.path || file.startsWith(`${module.path === "." ? "" : `${module.path}/`}`),
        ).filter((file) => SOURCE_EXTENSIONS.has(path.extname(file).toLowerCase())).length,
      }))
      .toSorted((left, right) => left.path.localeCompare(right.path) || left.name.localeCompare(right.name))
  })

  const dependencies: DependencyRecord[] = []
  if (options.resolveDependencies) {
    const packageDescriptors = descriptorPaths.filter(
      (item) => item.endsWith("package.json") || item.endsWith("oh-package.json5"),
    )
    for (const descriptor of packageDescriptors) {
      const consumer = projectForPath(projects, descriptor)
      if (!consumer) continue
      const data = await readStructured(options.root, descriptor)
      const dependencyMaps = [data.dependencies, data.devDependencies, data.peerDependencies]
      dependencyMaps.forEach((candidate) => {
        const values = object(candidate)
        if (!values) return
        Object.entries(values).forEach(([contract, raw]) => {
          if (typeof raw !== "string") return
          if (raw.startsWith("workspace:")) {
            const provider = projects.find(
              (project) => project.id !== consumer.id && (project.packageName === contract || project.outputSlug === contract),
            )
            if (provider) dependencies.push({ consumer: consumer.id, provider: provider.id, contract, evidence: descriptor })
            return
          }
          const target = localDependencyTarget(normalize(path.posix.dirname(descriptor)), raw)
          if (!target) return
          const provider = projectForPath(projects, target)
          if (!provider || provider.id === consumer.id) return
          dependencies.push({ consumer: consumer.id, provider: provider.id, contract, evidence: descriptor })
        })
      })
    }
    const bundleDescriptors = descriptorPaths.filter((item) => item.endsWith("bundle.json"))
    for (const descriptor of bundleDescriptors) {
      const consumer = projectForPath(projects, descriptor)
      if (!consumer) continue
      const data = await readStructured(options.root, descriptor)
      const component = object(data.component) ?? data
      const values = [component.deps, component.component_deps, component.third_party]
        .flatMap(strings)
        .filter(Boolean)
      values.forEach((contract) => {
        const provider = projects.find(
          (project) => project.id !== consumer.id && (project.outputSlug === contract || project.path.endsWith(`/${contract}`)),
        )
        if (!provider) return
        dependencies.push({ consumer: consumer.id, provider: provider.id, contract, evidence: descriptor })
      })
    }
  }

  const stats = options.includeStats ? await lineStats(options.root, files) : { sourceFiles: 0, lines: 0, byLanguage: {} }
  const moduleCount = projects.reduce((total, project) => total + project.modules.length, 0)
  const scale =
    stats.lines >= 1_000_000 || stats.sourceFiles >= 10_000 || projects.length >= 50 || moduleCount >= 300
      ? "very-large"
      : stats.lines >= 250_000 || stats.sourceFiles >= 3_000 || projects.length >= 20 || moduleCount >= 100
        ? "large"
        : "standard"
  const inventory = {
    schemaVersion: 1,
    generatedBy: "project_spec_analyze",
    root: ".",
    selectedRevision: options.revision,
    workspaceMode: projects.length > 1 ? "multi-project" : "single-project",
    scale,
    exclusions: DEFAULT_EXCLUDES,
    stats: { ...stats, projectCount: projects.length, moduleCount, elapsedMs: Date.now() - startedAt },
    topology: {
      repoManifest: manifest ?? null,
      gitmodules: gitmodules ?? null,
      linkedRoots: [...linkedRoots].toSorted(),
    },
    projects,
    dependencies: dependencies.filter(
      (item, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.consumer === item.consumer &&
            candidate.provider === item.provider &&
            candidate.contract === item.contract,
        ) === index,
    ),
    descriptorEvidence: descriptorPaths,
  }
  return inventory
}
